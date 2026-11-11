# План Фази 2: DynamoDB, створення та перегляд студентів

Мета фази: навчити бекенд зберігати студентів у DynamoDB і віддавати їхній
список із пагінацією. Авторизація викладача (Cognito) і rate limiting поки не
входять у цю фазу.

## 1. Модель даних

Таблиця DynamoDB `Students`:

| Атрибут | Тип | Опис |
| --- | --- | --- |
| `studentId` | String (partition key) | UUID, генерується на сервері |
| `fullName` | String | ПІБ студента |
| `group` | String | Навчальна група, наприклад `ІП-21` |
| `createdAt` | String (ISO 8601) | Коли студента додано |

Налаштування:

- billing mode `PAY_PER_REQUEST` (on-demand) — простіше й дешевше для навчання;
- encryption managed by AWS;
- видалення таблиці разом зі stack під час навчання (`RemovalPolicy.DESTROY`) —
  окремо позначити, що для production це небезпечно.

Для невеликого навчального застосунку достатньо `Scan` із `Limit` та
`ExclusiveStartKey`. Якщо згодом знадобиться фільтр за групою, можна додати GSI.

## 2. API-контракти

### `POST /students`

Створити студента.

Запит:

```json
{
  "fullName": "Іван Петренко",
  "group": "ІП-21"
}
```

Успішна відповідь `201 Created`:

```json
{
  "studentId": "0b6f...",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

Помилки:

- `400 Bad Request` — відсутнє або порожнє поле, задовгі значення;
- `500 Internal Server Error` — непередбачена помилка DynamoDB.

Валідація: `fullName` — 1–200 символів, `group` — 1–50 символів, обидва поля
обов'язкові; зайві пробіли обрізаються.

### `GET /admin/students`

Повернути список студентів з пагінацією.

Query-параметри:

- `limit` — кількість записів, за замовчуванням `20`, максимум `100`;
- `cursor` — непрозорий токен наступної сторінки (base64url від
  `LastEvaluatedKey`), необов'язковий.

Відповідь `200 OK`:

```json
{
  "items": [
    {
      "studentId": "0b6f...",
      "fullName": "Іван Петренко",
      "group": "ІП-21",
      "createdAt": "2026-11-11T18:00:00.000Z"
    }
  ],
  "nextCursor": null
}
```

Якщо є наступна сторінка, `nextCursor` містить рядок, який клієнт передає назад
у параметрі `cursor`. Якщо сторінок більше немає — `null`.

## 3. Код

Запропонована структура:

```text
src/
├── handlers/
│   ├── health.ts            # уже є
│   ├── create-student.ts    # POST /students
│   └── list-students.ts     # GET /admin/students
├── lib/
│   ├── students.ts          # типи Student, CreateStudentInput
│   ├── validation.ts        # перевірка вхідних даних
│   └── responses.ts         # спільні JSON-відповіді та помилки
└── repositories/
    └── students-repository.ts  # робота з DynamoDB
```

Принципи:

- обробник приймає event, валідовує дані, викликає repository і формує відповідь;
- repository ховає деталі DynamoDB (`PutCommand`, `ScanCommand`);
- для тестів repository передається як залежність або мокається, щоб не звертатися
  до справжньої таблиці;
- AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`) є в runtime
  Node.js 22, тому його можна не включати в бандл Lambda
  (`externalModules: ['@aws-sdk/*']`).

## 4. Інфраструктура (CDK)

1. Створити `Table` з partition key `studentId`.
2. Створити дві Lambda-функції або один handler з маршрутизацією — для початку
   простіше дві окремі функції з окремими файлами.
3. Передати Lambda змінну середовища `STUDENTS_TABLE_NAME`.
4. Видати IAM-дозволи: `table.grantReadWriteData(fn)`.
5. Додати маршрути:
   - `POST /students`;
   - `GET /admin/students`.
6. Додати outputs за потреби (наприклад, ім'я таблиці).
7. Не деплоїти публічно, поки `/admin/students` не захищений авторизацією.

## 5. Тести

- Unit-тести валідації: порожні поля, задовгі значення, зайві пробіли.
- Unit-тести обробників із замоканим repository:
  - успішне створення → `201`;
  - невалідні дані → `400`;
  - пагінація → правильні `limit`, `cursor`, `nextCursor`.
- CDK-тести:
  - існує одна таблиця DynamoDB з правильним ключем;
  - Lambda отримує `STUDENTS_TABLE_NAME`;
  - є маршрути `POST /students` і `GET /admin/students`;
  - IAM-політика дозволяє читання й запис у таблицю.

## 6. Критерії готовності

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm synth` проходять.
- `POST /students` створює запис у DynamoDB (перевірка локально або в тестовому
  акаунті).
- `GET /admin/students` повертає сторінку та коректний `nextCursor`.
- Немає секретів у коді; пароль/ключі не потрібні для локальних тестів.

## 7. Що буде після Фази 2

- **Фаза 3:** Cognito User Pool, група `teachers`, JWT-authorizer для
  `/admin/*`, захист `POST /students`.
- **Фаза 4:** rate limiting на рівні API Gateway (throttling), CORS для домену
  фронтенду, базовий моніторинг і алерти.
