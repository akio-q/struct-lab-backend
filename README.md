# StructLab Backend

Бекенд навчального вебзастосунку **StructLab** — тренажера структур даних.

Поточна фаза — **Фаза 2**: студенти зберігаються в DynamoDB, працює публічний
`POST /students`, а обробник `GET /admin/students` із cursor-based пагінацією вже
реалізований і протестований, але **навмисно не підключений до API Gateway** до
появи Cognito.

> **Важливо:** `POST /students` у Фазі 2 тимчасово публічний. Перед публічним
> production-деплоєм його потрібно захистити авторизацією та налаштувати rate
> limiting.

## Що реалізовано

- AWS CDK stack з:
  - DynamoDB-таблицею студентів;
  - Lambda для `GET /health`;
  - Lambda для `POST /students`;
  - Lambda для `GET /admin/students` (без публічного маршруту);
  - API Gateway HTTP API з маршрутами `GET /health` і `POST /students`.
- Зберігання студента: `studentId`, `fullName`, `group`, `createdAt`.
- Серверна валідація вхідних даних.
- Генерація UUID для кожного студента.
- Cursor-based пагінація через DynamoDB `Scan`.
- Least-privilege IAM:
  - створення — лише `dynamodb:PutItem`;
  - перегляд — лише `dynamodb:Scan`.
- Тести без AWS: валідація, cursor, створення, пагінація, помилки, CDK.
- Скрипти `lint`, `typecheck`, `test`, `build`, `synth`.

## Чого ще немає

- Cognito та авторизації викладача.
- Публічного маршруту `GET /admin/students`.
- Rate limiting.
- CORS для фронтенду.
- Деплою в AWS.
- Пагінації по 5000 записів — вимога ще не підтверджена, тому не реалізована.

## Архітектура

```text
POST /students (тимчасово публічний)
Клієнт ──► API Gateway HTTP API ──► CreateStudent Lambda ──► DynamoDB PutItem
                                                              Students table

GET /health (публічний)
Клієнт ──► API Gateway HTTP API ──► Health Lambda ──► JSON

GET /admin/students (НЕ підключений до API Gateway)
Фаза 3: Cognito JWT ──► ListStudents Lambda ──► DynamoDB Scan ──► items + nextCursor
```

Пояснення:

- **API Gateway HTTP API** приймає HTTP-запити й має публічний URL.
- **Lambda** виконує бізнес-логіку; кожен обробник має окрему роль.
- **DynamoDB** зберігає записи студентів.
- **Cognito** з'явиться у Фазі 3 і захистить адміністративні операції.
- **Rate limiting** буде доданий разом із захистом API.

## Структура проєкту

```text
struct-lab-backend/
├── bin/
│   └── app.ts                         # Точка входу CDK-застосунку
├── lib/
│   └── struct-lab-stack.ts            # DynamoDB, Lambda, IAM, HTTP API
├── src/
│   ├── constants.ts                   # Назва сервісу
│   ├── handlers/
│   │   ├── health.ts                  # GET /health
│   │   ├── create-student.ts          # POST /students
│   │   └── list-students.ts           # GET /admin/students (без маршруту)
│   ├── lib/
│   │   ├── errors.ts                  # Безпечне ім'я помилки для логів
│   │   └── http.ts                    # JSON-відповіді та тип handler
│   └── students/
│       ├── cursor.ts                  # Кодування/перевірка cursor
│       ├── repository.ts              # DynamoDB PutItem/Scan
│       ├── types.ts                   # Student, CreateStudentInput, StudentCursor
│       └── validation.ts              # Валідація body та query-параметрів
├── test/
│   ├── helpers/
│   │   └── events.ts                  # Тестовий API Gateway event
│   ├── health.test.ts                 # GET /health
│   ├── validation.test.ts             # Валідація body та limit
│   ├── cursor.test.ts                 # Формат і перевірка cursor
│   ├── create-student.test.ts         # Створення, помилки, відсутність PII у логах
│   ├── list-students.test.ts          # Пагінація, некоректні запити, помилки DB
│   ├── students-repository.test.ts    # PutCommand/ScanCommand, cursor, помилки DB
│   ├── handler-initialization.test.ts # Відсутня STUDENTS_TABLE_NAME
│   ├── handler-initialization-error.test.ts # Помилка створення repository
│   └── struct-lab-stack.test.ts       # DynamoDB, IAM, Lambda, routes
├── docs/
│   └── phase-2-plan.md                # Реалізована архітектура та межі Фази 2
├── cdk.json                           # Налаштування CDK CLI
├── eslint.config.mjs                  # Правила лінтера
├── package.json                       # Залежності та скрипти
├── pnpm-lock.yaml                     # Зафіксовані версії залежностей
├── pnpm-workspace.yaml                # Дозвіл build-скрипта esbuild
├── tsconfig.json                      # TypeScript для розробки й тестів
├── tsconfig.build.json                # TypeScript для збірки в dist/
├── vitest.config.mts                  # Налаштування тестів
├── .gitignore
└── README.md
```

### Призначення основних файлів

| Файл | Для чого потрібен |
| --- | --- |
| `bin/app.ts` | Створює CDK-застосунок і додає `StructLabStack`. |
| `lib/struct-lab-stack.ts` | Описує DynamoDB-таблицю, три Lambda, IAM-політики, HTTP API та outputs. |
| `src/handlers/health.ts` | Повертає стан сервісу для `GET /health`. |
| `src/handlers/create-student.ts` | Валідовує JSON, генерує UUID і зберігає студента через repository. |
| `src/handlers/list-students.ts` | Читає `limit`/`cursor`, викликає repository і формує `items`/`nextCursor`. |
| `src/students/validation.ts` | Перевіряє ПІБ, групу, `limit` і наявність cursor. |
| `src/students/cursor.ts` | Кодує DynamoDB key у base64url, обмежує довжину й перевіряє структуру. |
| `src/students/repository.ts` | Інтерфейс repository та DynamoDB-реалізація з `PutCommand`/`ScanCommand`. |
| `src/students/types.ts` | Спільні TypeScript-типи для студентів і cursor. |
| `src/lib/http.ts` | Єдина JSON-відповідь і тип HTTP handler. |
| `src/lib/errors.ts` | Для логів береться лише назва класу помилки, без даних студента. |
| `test/helpers/events.ts` | Мінімальний API Gateway event для unit-тестів. |
| `test/students-repository.test.ts` | Перевіряє `PutCommand`, `ScanCommand`, перетворення `LastEvaluatedKey` і помилки DynamoDB. |
| `test/handler-initialization.test.ts` | Перевіряє generic `500`, якщо не задано `STUDENTS_TABLE_NAME`. |
| `test/handler-initialization-error.test.ts` | Перевіряє generic `500`, якщо створення repository падає. |
| `test/struct-lab-stack.test.ts` | Перевіряє таблицю, IAM, Lambda, відсутність admin-маршруту та output. |
| `cdk.json` | Каже CDK CLI запускати `bin/app.ts` і складати результат у `cdk.out/`. |
| `tsconfig.json` | Strict TypeScript для всього проєкту. |
| `tsconfig.build.json` | Компіляція `bin/`, `lib/`, `src/` у `dist/` без тестів. |
| `vitest.config.mts` | Тести лежать у `test/**/*.test.ts`. |
| `pnpm-workspace.yaml` | Дозволяє esbuild виконати build-скрипт. |

## DynamoDB

Логічна назва конструкції — `StudentsTable`. Фізичну назву таблиці генерує CDK,
щоб уникнути конфліктів між stack-ами та середовищами.

| Параметр | Значення |
| --- | --- |
| Partition key | `studentId` (String) |
| Billing mode | `PAY_PER_REQUEST` (on-demand) |
| Encryption | AWS managed key (`TableEncryption.AWS_MANAGED`) |
| Deletion protection | вимкнено (навчальне середовище) |
| Removal policy | `DESTROY` |
| Update replace policy | `Delete` |

Запис студента:

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

### Ризик втрати даних

`RemovalPolicy.DESTROY` означає, що під час видалення stack **усі дані таблиці
будуть втрачені**. Це зроблено навмисно для навчального середовища, а в
`cdk synth` додається попередження через CDK Annotations.

Для production потрібно:

- змінити removal policy на `RETAIN`;
- увімкнути `deletionProtection: true`;
- увімкнути point-in-time recovery та налаштувати бекапи;
- керувати таблицею через окремий production stack.

## `POST /students`

Метод: `POST`

Шлях: `/students`

Авторизація: **тимчасово відсутня** (публічний контракт Фази 2).

### Запит

```json
{
  "fullName": "Іван Петренко",
  "group": "ІП-21"
}
```

Правила валідації:

- тіло має бути JSON-об'єктом;
- `fullName` — рядок, 1–200 символів після обрізання пробілів;
- `group` — рядок, 1–50 символів після обрізання пробілів;
- зайві поля ігноруються;
- сервер генерує `studentId` (UUID v4) і `createdAt` (ISO 8601).

### Успішна відповідь `201 Created`

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

### Помилки

`400 Bad Request`:

```json
{
  "error": "fullName must be a non-empty string"
}
```

`500 Internal Server Error` — без деталей DynamoDB:

```json
{
  "error": "Internal server error"
}
```

У логи не записуються ПІБ, група або повний запит. Для помилки логирується лише
назва класу помилки.

## `GET /admin/students`

Обробник і тести реалізовані, але **маршрут не зареєстрований в API Gateway**.
Публічного URL для перегляду персональних даних немає. Це перевіряється
CDK-тестом.

Контракт майбутнього захищеного маршруту:

Query-параметри:

- `limit` — ціле число від `1` до `100`, за замовчуванням `20`;
- `cursor` — непрозорий токен наступної сторінки, необов'язковий.

Відповідь `200 OK`:

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

Якщо є наступна сторінка, `nextCursor` містить рядок. Клієнт передає його назад
у параметрі `cursor`. Якщо сторінок більше немає — `null`.

### Пагінація та cursor

- Використовується DynamoDB `Scan` із `Limit`, `ExclusiveStartKey` і
  `LastEvaluatedKey`.
- Cursor — base64url-кодований DynamoDB key `{ "studentId": "..." }`.
- Формат вважається внутрішньою деталлю: клієнт не повинен його розбирати.
- Максимальна довжина cursor — 512 символів.
- Перевіряється base64url-формат, JSON-структура, наявність лише ключа
  `studentId` і відповідність `studentId` формату UUID v4.
- Некоректний cursor повертає `400 Bad Request`, а не `500`.
- `Scan` **не гарантує стабільного сортування**. Порядок між сторінками не є
  бізнес-контрактом.
- Ліміт у 5000 записів на сторінку не реалізований, бо вимога не підтверджена.
- Репозиторій повертає лише поля `studentId`, `fullName`, `group`, `createdAt`,
  тому зайві атрибути з таблиці не потрапляють у відповідь.

## Безпека

- **Least privilege IAM.** Create Lambda має лише `dynamodb:PutItem`, List Lambda
  — лише `dynamodb:Scan`. Обидва дозволи обмежені ARN таблиці.
- `grantReadWriteData()` не використовується.
- **Немає публічного admin-маршруту.** Lambda для перегляду існує, але API
  Gateway її не викликає.
- **ПІБ не логуються.** У разі помилки логуються лише назва помилки та
  повідомлення без тіла запиту/вмісту таблиці.
- **Помилки ініціалізації repository не розкриваються клієнту.** Відсутня
  `STUDENTS_TABLE_NAME` або збій створення repository повертає generic `500`,
  а в лог пише лише назва класу помилки.
- **Немає AWS credentials** у репозиторії.
- `.env` ігнорується Git.
- `POST /students` тимчасово публічний. До production-деплою потрібні Cognito,
  авторизація та rate limiting.

## Вимоги

- Node.js 22+ (перевірено на Node.js 24).
- pnpm 10+ (перевірено на pnpm 11.14).
- AWS-акаунт **не потрібен** для `lint`, `typecheck`, `test`, `build` і `synth`.

## Встановлення

```bash
pnpm install
```

Якщо pnpm попросить підтвердити build-скрипт esbuild:

```bash
pnpm approve-builds --all
```

## Команди

| Команда | Що робить | Звертається до AWS? |
| --- | --- | --- |
| `pnpm lint` | Перевіряє код ESLint. | Ні |
| `pnpm typecheck` | Перевіряє типи TypeScript. | Ні |
| `pnpm test` | Запускає всі тести Vitest. | Ні |
| `pnpm test:watch` | Запускає тести у watch-режимі. | Ні |
| `pnpm build` | Компілює код у `dist/`. | Ні |
| `pnpm synth` | Генерує CloudFormation-шаблон у `cdk.out/`. | Ні |
| `pnpm cdk ...` | Проксі до CDK CLI. | Залежить від команди |

Повний локальний цикл:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm synth
```

Очікувані результати:

- `lint` і `typecheck` — без помилок;
- `test` — **9 тестових файлів, 97 тестів пройшли**;
- `build` — тека `dist/` з `.js`, `.d.ts` і source maps;
- `synth` — `cdk.out/StructLabBackendStack.template.json` і попередження про
  видалення таблиці (це очікувано).

## Тестування

Тести не потребують AWS, DynamoDB чи credentials. DynamoDB-репозиторій
підміняється через dependency injection.

- `test/validation.test.ts` — валідація ПІБ, групи, `limit`, cursor.
- `test/cursor.test.ts` — round-trip, base64url, обмеження довжини, некоректні
  cursor.
- `test/create-student.test.ts` — `201`, UUID, обрізання пробілів, base64 body,
  `400`, `500`, відсутність ПІБ у логах.
- `test/list-students.test.ts` — limit за замовчуванням, кастомний limit,
  cursor, `nextCursor`, некоректні параметри, `500`, відсутність ПІБ у логах.
- `test/students-repository.test.ts` — `PutCommand`, `ScanCommand` з `Limit` і
  `ExclusiveStartKey`, перетворення `LastEvaluatedKey`, порожні результати,
  поширення помилок DynamoDB.
- `test/handler-initialization.test.ts` — generic `500` без витоку внутрішніх
  деталей, якщо `STUDENTS_TABLE_NAME` відсутня.
- `test/handler-initialization-error.test.ts` — generic `500`, якщо створення
  repository завершується помилкою.
- `test/health.test.ts` — `GET /health`.
- `test/struct-lab-stack.test.ts` — DynamoDB, три Lambda, IAM, відсутність
  `GET /admin/students`, наявність лише двох публічних маршрутів, output.

## Як працює `cdk synth`

1. CDK CLI читає `cdk.json` і запускає `bin/app.ts` через `ts-node`.
2. `StructLabStack` створює DynamoDB, Lambda, IAM та HTTP API.
3. `NodejsFunction` збирає кожен обробник через esbuild.
4. AWS SDK для DynamoDB включається в бандл Lambda, щоб не залежати від версії
   SDK у runtime.
5. CDK формує CloudFormation-шаблон у `cdk.out/`.

`synth` не створює ресурсів в AWS, не завантажує файли в S3 і не потребує
AWS-ключів. Stack не має фіксованих `account`/`region` — вони визначаться під час
деплою.

## Можливі проблеми

| Проблема | Рішення |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: esbuild` | `pnpm approve-builds --all`. |
| Тест CDK падає за таймаутом | Перший бандл AWS SDK повільніший; таймаут у тесті — 60 секунд. |
| `cdk synth` показує WARNING про видалення таблиці | Це навмисне попередження для навчального середовища. |
| `cdk synth` пише про feature flags | Інформаційне повідомлення, не помилка. |
| `pnpm synth` не знаходить `ts-node` | Виконати `pnpm install`. |
| Потрібен деплой | Не входить у Фазу 2. Потрібні AWS-акаунт, credentials, bootstrap і окреме рішення щодо захисту API. |

## Наступна фаза

Фаза 3:

1. Додати Cognito User Pool і групу викладачів.
2. Додати JWT-authorizer для `/admin/*`.
3. Підключити `GET /admin/students` до API Gateway лише після авторизації.
4. Захистити `POST /students`.
5. Додати rate limiting на рівні API Gateway.
6. Налаштувати CORS для домену фронтенду.
7. Додати integration-тести захищених маршрутів.

Детальніше: [`docs/phase-2-plan.md`](docs/phase-2-plan.md).
