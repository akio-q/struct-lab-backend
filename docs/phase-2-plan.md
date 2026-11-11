# Фаза 2: DynamoDB і Students API

**Статус: реалізовано локально, без деплою в AWS.**

Цей документ описує фактичну архітектуру Фази 2. Перша версія плану містила
застарілі рішення (`grantReadWriteData`, публічний `GET /admin/students`,
реєстрація обох маршрутів одразу). Вони скасовані: актуальними є вимоги цієї
фази та код у репозиторії.

## 1. Мета і межі

Реалізовано:

- DynamoDB-таблиця студентів;
- публічний `POST /students` (тимчасово);
- Lambda та unit-тести для `GET /admin/students`;
- cursor-based пагінація;
- least-privilege IAM;
- CDK-тести інфраструктури.

Не реалізовано:

- Cognito та авторизація;
- публічний маршрут `GET /admin/students`;
- rate limiting;
- CORS;
- деплой в AWS;
- пагінація по 5000 записів (вимога не підтверджена).

## 2. Архітектура

```text
POST /students (публічний у Фазі 2)
API Gateway HTTP API
        │
        ▼
CreateStudent Lambda ── PutItem ──► DynamoDB: Students
        │
        ▼
201 Created + створений запис

GET /health
API Gateway HTTP API ──► Health Lambda ──► 200 OK

GET /admin/students (НЕ зареєстрований в API Gateway)
Фаза 3: Cognito JWT ──► ListStudents Lambda ── Scan ──► DynamoDB
        │
        ▼
200 OK + { items, nextCursor }
```

У CDK створюються три Lambda-функції. List Lambda має IAM-дозвіл і змінну
середовища з назвою таблиці, але не має інтеграції з API Gateway. Тому публічного
URL для перегляду персональних даних немає.

## 3. DynamoDB

Логічна конструкція CDK: `StudentsTable`. Фізична назва генерується CDK.

| Параметр | Значення |
| --- | --- |
| Partition key | `studentId`, String |
| Billing mode | `PAY_PER_REQUEST` |
| Encryption | `TableEncryption.AWS_MANAGED` |
| Deletion protection | `false` |
| Removal policy | `RemovalPolicy.DESTROY` |
| Update replace policy | `Delete` |

Атрибути запису:

- `studentId` — UUID v4, генерується сервером;
- `fullName` — ПІБ;
- `group` — навчальна група;
- `createdAt` — ISO 8601.

### Ризик втрати даних

`RemovalPolicy.DESTROY` дозволений лише для навчального середовища. Під час
видалення stack таблиця та всі записи студентів знищуються. У stack додано
CDK Annotation з попередженням, яке видно під час `cdk synth`.

Перед production-деплоєм обов'язково:

- замінити `DESTROY` на `RETAIN`;
- увімкнути `deletionProtection: true`;
- увімкнути point-in-time recovery та бекапи;
- винести таблицю в окремий production stack.

## 4. API

### `POST /students`

Публічний маршрут у Фазі 2. Це тимчасовий контракт: перед публічним
production-деплоєм потрібна авторизація та rate limiting.

Запит:

```json
{
  "fullName": "Іван Петренко",
  "group": "ІП-21"
}
```

Успіх `201 Created`:

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

Валідація:

- тіло — JSON-об'єкт;
- `fullName` — 1–200 символів;
- `group` — 1–50 символів;
- пробіли на початку й у кінці обрізаються;
- зайві поля ігноруються.

Помилки:

- `400` — невалідний JSON, відсутні/порожні/задовгі поля;
- `500` — помилка DynamoDB, відповідь `{ "error": "Internal server error" }`
  без деталей.

### `GET /admin/students`

Обробник реалізований, але маршрут **не зареєстрований** в API Gateway. Це
перевіряє CDK-тест.

Query-параметри:

- `limit` — ціле число 1–100, за замовчуванням 20;
- `cursor` — необов'язковий непрозорий токен.

Відповідь:

```json
{
  "items": [
    {
      "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
      "fullName": "Іван Петренко",
      "group": "ІП-21",
      "createdAt": "2026-11-11T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Некоректний `limit` або `cursor` повертає `400`, а не `500`.

## 5. Пагінація

Використовується DynamoDB `Scan`:

```text
Scan(Limit = limit, ExclusiveStartKey = decodedCursor)
  → Items
  → LastEvaluatedKey
  → nextCursor = base64url(JSON(LastEvaluatedKey))
```

Cursor:

- кодує лише `{ "studentId": "..." }`;
- base64url;
- максимальна довжина — 512 символів;
- перевіряється base64url-формат, JSON-парсинг, набір ключів і відповідність
  `studentId` формату UUID v4;
- при будь-якій помилці повертається `400`;
- формат є внутрішньою деталлю й може змінитися.

Обмеження:

- `Scan` не гарантує стабільного сортування, тому порядок між сторінками не є
  контрактом;
- ліміт 5000 записів на сторінку не реалізований;
- для великих обсягів даних у майбутньому можна розглянути GSI та `Query`, але
  це поза межами Фази 2.

## 6. IAM: least privilege

| Lambda | Дозвіл | Ресурс |
| --- | --- | --- |
| CreateStudent | `dynamodb:PutItem` | ARN таблиці |
| ListStudents | `dynamodb:Scan` | ARN таблиці |

`grantReadWriteData()` не використовується. Обидві Lambda додатково мають
стандартну managed-політику `AWSLambdaBasicExecutionRole` для запису логів у
CloudWatch.

## 7. Персональні дані та логи

- ПІБ, група та тіло запиту не логуються.
- У разі помилки логуються лише назва класу помилки та безпечне повідомлення.
- Відповідь `500` не містить деталей DynamoDB.
- Помилка відсутньої `STUDENTS_TABLE_NAME` або створення repository також
  повертає клієнту generic `500` без внутрішніх деталей.
- Маршрут перегляду студентів не є публічним.
- Repository повертає лише чотири відомі поля, тому зайві атрибути таблиці не
  потрапляють у відповідь.
- AWS credentials у проєкті відсутні.

## 8. Структура коду

```text
src/
├── handlers/
│   ├── health.ts
│   ├── create-student.ts
│   └── list-students.ts
├── lib/
│   ├── errors.ts
│   └── http.ts
└── students/
    ├── cursor.ts
    ├── repository.ts
    ├── types.ts
    └── validation.ts
```

Ключові рішення:

- handlers залежать від інтерфейсу `StudentsRepository`;
- unit-тести передають fake repository через factory
  `buildCreateStudentHandler` / `buildListStudentsHandler`;
- production-обробники створюють DynamoDB repository ліниво, під час першого
  виклику;
- помилки ініціалізації repository перехоплюються та не розкриваються клієнту;
- cursor приймає лише `studentId` у форматі UUID v4;
- AWS SDK для DynamoDB включається в бандл Lambda (`bundleAwsSDK: true`), щоб
  не залежати від версії SDK у runtime.

## 9. Тести

- `test/validation.test.ts` — ПІБ, група, `limit`, cursor.
- `test/cursor.test.ts` — round-trip, base64url, валідні UUID v4, невалідні
  UUID/формати.
- `test/create-student.test.ts` — `201`, UUID, base64 body, `400`, `500`,
  відсутність PII у логах.
- `test/list-students.test.ts` — limit за замовчуванням, cursor, `nextCursor`,
  некоректні параметри (включно з невалідним UUID), `500`, відсутність PII у
  логах.
- `test/students-repository.test.ts` — `PutCommand`, `ScanCommand` з `Limit` і
  `ExclusiveStartKey`, перетворення `LastEvaluatedKey`, порожні результати,
  поширення помилок DynamoDB.
- `test/handler-initialization.test.ts` — generic `500` без витоку внутрішніх
  деталей, якщо `STUDENTS_TABLE_NAME` відсутня.
- `test/handler-initialization-error.test.ts` — generic `500`, якщо створення
  repository завершується помилкою.
- `test/health.test.ts` — health endpoint.
- `test/struct-lab-stack.test.ts` — DynamoDB, IAM, три Lambda, відсутність
  admin-маршруту, наявність лише `GET /health` і `POST /students`.

Усього: **9 тестових файлів, 97 тестів**.

## 10. Локальна перевірка

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm synth
```

Очікувано:

- lint і typecheck проходять без помилок;
- 97 тестів проходять;
- build створює `dist/`;
- synth створює `cdk.out/StructLabBackendStack.template.json`.

`synth` навмисно показує WARNING про видалення таблиці. Це не помилка.

## 11. Відомі обмеження та ризики

- `POST /students` публічний до Фази 3.
- Rate limiting відсутній.
- CORS не налаштований.
- `GET /admin/students` недоступний через API Gateway.
- Немає інтеграційних тестів із реальною DynamoDB; використовуються mocks.
- Немає стабільного сортування результатів.
- Немає пагінації по 5000 записів.
- Таблиця видаляється разом зі stack.
- Деплой не виконувався.

## 12. Наступна фаза

1. Cognito User Pool і група викладачів.
2. JWT-authorizer для `/admin/*`.
3. Реєстрація `GET /admin/students` лише після авторизації.
4. Захист `POST /students`.
5. Rate limiting на API Gateway.
6. CORS для фронтенду.
7. Integration-тести захищених маршрутів.

## 13. Критерії готовності Фази 2

- [x] DynamoDB створюється через CDK.
- [x] Partition key `studentId`, billing `PAY_PER_REQUEST`, encryption увімкнено.
- [x] `RemovalPolicy.DESTROY` задокументований як навчальний режим.
- [x] `POST /students` валідовує дані, генерує UUID, зберігає запис.
- [x] `POST /students` повертає `201` або коректні `400`/`500`.
- [x] List handler використовує `Scan` і cursor-based pagination.
- [x] Default limit 20, maximum 100.
- [x] Некоректний cursor повертає `400`.
- [x] Cursor приймає лише UUID v4 у `studentId`.
- [x] Repository покритий unit-тестами `PutCommand`/`ScanCommand` і помилок DB.
- [x] Помилки ініціалізації repository не розкриваються клієнту.
- [x] `GET /admin/students` не зареєстрований в API Gateway.
- [x] IAM: лише `PutItem` для створення та `Scan` для перегляду.
- [x] ПІБ не логуються.
- [x] Тести не потребують AWS.
- [x] `lint`, `typecheck`, `test`, `build`, `synth` проходять.
- [x] Деплой, bootstrap і створення хмарних ресурсів не виконувалися.
