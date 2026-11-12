# StructLab Backend

Бекенд навчального вебзастосунку **StructLab** — тренажера структур даних.

Поточна фаза — **Фаза 3**: студенти реєструються через публічний
`POST /students`, а перегляд студентів доступний лише викладачам через
`GET /admin/students` із Cognito JWT.

> **Статус:** усе реалізовано й перевірено локально. Деплою в AWS, bootstrap і
> реальних integration-тестів ще не було.

## Поточний API

| Метод і шлях | Авторизація | Призначення |
| --- | --- | --- |
| `GET /health` | Публічний | Перевірка доступності сервісу |
| `POST /students` | Публічний | Реєстрація студента без Cognito-акаунта |
| `GET /admin/students` | Cognito **access token** + група `teachers` | Перегляд студентів із cursor-based пагінацією |

Детальний контракт для фронтенду:
[`docs/frontend-integration.md`](docs/frontend-integration.md).

## Що реалізовано

- AWS CDK stack з:
  - DynamoDB-таблицею студентів;
  - Cognito User Pool для викладачів;
  - трьома Lambda-функціями;
  - API Gateway HTTP API з трьома маршрутами;
  - JWT authorizer лише для `GET /admin/students`;
  - least-privilege IAM;
  - stack outputs для URL API та Cognito.
- Публічний `POST /students`:
  - без Cognito-акаунта, JWT або групи `teachers`;
  - валідація `fullName` і `group`;
  - генерація `studentId` (UUID v4) і `createdAt` (ISO 8601);
  - збереження в DynamoDB через `PutItem`.
- Захищений `GET /admin/students`:
  - Cognito access token;
  - JWT authorizer на рівні API Gateway;
  - додаткова Lambda-перевірка `token_use === "access"` і точної групи
    `teachers`;
  - cursor-based пагінація через DynamoDB `Scan`;
  - відповідь `{ items, nextCursor }`.
- Безпечні помилки: generic `500` без деталей DynamoDB та без PII/токенів у
  логах.
- Тести без AWS: авторизація, валідація, cursor, handlers, repository, CDK.

## Чого ще немає

- Деплою в AWS і post-deploy integration-тестів.
- Rate limiting, WAF і CAPTCHA для публічної реєстрації.
- CORS для фронтенду.
- Перевірки особи студента та захисту від дублікатів.
- Production hardening: MFA, deletion protection, бекапи, PITR, аудит.
- Пагінації по 5000 записів — вимога ще не підтверджена.

## Архітектура

```text
GET /health (публічний)
Клієнт ──► API Gateway HTTP API ──► Health Lambda ──► 200 JSON

POST /students (публічний)
Клієнт ──► API Gateway HTTP API ──► CreateStudent Lambda ──► DynamoDB PutItem
                                                              Students table

GET /admin/students (лише викладачі)
Клієнт ──► API Gateway HTTP API
              │ JWT authorizer: підпис, issuer, audience
              ▼
         ListStudents Lambda
              │ перевірка access token + групи teachers
              ▼
         DynamoDB Scan ──► { items, nextCursor }

Cognito User Pool
  ├── self-sign-up вимкнено
  ├── один публічний App Client без secret
  ├── SRP-автентифікація
  ├── група teachers
  └── access token 30 хвилин
```

Пояснення:

- **API Gateway HTTP API** приймає запити; `GET /health` і `POST /students`
  публічні, `GET /admin/students` захищений JWT authorizer.
- **Cognito** використовується лише викладачами. Студенти не мають
  Cognito-акаунтів.
- **JWT authorizer** перевіряє підпис, issuer і audience до виклику Lambda.
- **Lambda teacher guard** додатково вимагає access token (не ID token) і точну
  групу `teachers`.
- **DynamoDB** зберігає записи студентів; IAM обмежений однією таблицею.
- **Rate limiting і CORS** поки не налаштовані.

## Структура проєкту

```text
struct-lab-backend/
├── bin/
│   └── app.ts                         # Точка входу CDK-застосунку
├── lib/
│   └── struct-lab-stack.ts            # DynamoDB, Cognito, Lambda, IAM, HTTP API
├── src/
│   ├── constants.ts                   # Назва сервісу та група teachers
│   ├── handlers/
│   │   ├── health.ts                  # GET /health
│   │   ├── create-student.ts          # POST /students (публічний)
│   │   └── list-students.ts           # GET /admin/students (teacher-only)
│   ├── lib/
│   │   ├── auth.ts                    # JWT claims і teacher authorization
│   │   ├── errors.ts                  # Безпечне ім'я помилки для логів
│   │   └── http.ts                    # JSON-відповіді та тип handler
│   └── students/
│       ├── cursor.ts                  # Кодування/перевірка cursor
│       ├── repository.ts              # DynamoDB PutItem/Scan
│       ├── types.ts                   # Student, CreateStudentInput, StudentCursor
│       └── validation.ts              # Валідація body та query-параметрів
├── test/
│   ├── helpers/
│   │   └── events.ts                  # Тестові API Gateway events
│   ├── health.test.ts                 # GET /health
│   ├── validation.test.ts             # Валідація body та limit
│   ├── cursor.test.ts                 # Формат і перевірка cursor
│   ├── create-student.test.ts         # Публічне створення, 400/500, логи
│   ├── list-students.test.ts          # Пагінація, авторизація, помилки
│   ├── students-repository.test.ts    # PutCommand/ScanCommand
│   ├── handler-initialization.test.ts # Відсутня STUDENTS_TABLE_NAME
│   ├── handler-initialization-error.test.ts # Помилка створення repository
│   ├── auth.test.ts                   # JWT claims і teacher guard
│   └── struct-lab-stack.test.ts       # CDK: ресурси, IAM, routes, Cognito
├── docs/
│   ├── phase-2-plan.md                # Історичний план Фази 2
│   ├── phase-3-plan.md                # Фактична архітектура Фази 3
│   └── frontend-integration.md        # Контракт для фронтенду
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
| `lib/struct-lab-stack.ts` | DynamoDB, Cognito, три Lambda, IAM, HTTP API, authorizer та outputs. |
| `src/handlers/health.ts` | Повертає стан сервісу для `GET /health`. |
| `src/handlers/create-student.ts` | Публічно валідовує JSON, генерує UUID і зберігає студента. |
| `src/handlers/list-students.ts` | Перевіряє викладача, читає `limit`/`cursor`, повертає сторінку. |
| `src/lib/auth.ts` | Витягує JWT claims, вимагає access token і точну групу `teachers`. |
| `src/students/validation.ts` | Перевіряє ПІБ, групу, `limit` і наявність cursor. |
| `src/students/cursor.ts` | Кодує DynamoDB key у base64url, обмежує довжину й перевіряє структуру. |
| `src/students/repository.ts` | Інтерфейс repository та DynamoDB-реалізація з `PutCommand`/`ScanCommand`. |
| `src/students/types.ts` | Спільні TypeScript-типи для студентів і cursor. |
| `src/lib/http.ts` | Єдина JSON-відповідь і тип HTTP handler. |
| `src/lib/errors.ts` | Для логів береться лише назва класу помилки, без даних студента. |
| `test/helpers/events.ts` | Мінімальні API Gateway events для unit-тестів. |
| `test/auth.test.ts` | Перевіряє malformed claims, ID token, точну групу та відсутність логування при відмові. |
| `test/struct-lab-stack.test.ts` | Перевіряє DynamoDB, Cognito, IAM, три Lambda та три routes. |
| `docs/phase-3-plan.md` | Рішення, архітектура, безпека та межі Фази 3. |
| `docs/frontend-integration.md` | Точний контракт для фронтенду. |
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
| Point-in-time recovery | не налаштовано |

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

## Cognito

| Параметр | Значення |
| --- | --- |
| Логічна конструкція User Pool | `TeachersUserPool` |
| Self-sign-up | вимкнено (`selfSignUpEnabled: false`) |
| Створення користувачів | лише адміністратором (`AllowAdminCreateUserOnly: true`) |
| Пароль | мінімум 12 символів; lowercase, uppercase, digits, symbols |
| App Client | один публічний, без secret (`GenerateSecret: false`) |
| Auth flow | SRP (`ALLOW_USER_SRP_AUTH`) + refresh token |
| OAuth / Hosted UI | вимкнено; немає domain, callback URL, scopes |
| Access token | 30 хвилин |
| Група | `teachers` |
| Removal policy User Pool | `RETAIN` |
| Removal policy App Client | не задано (типова поведінка — видалення) |
| Removal policy групи `teachers` | не задано (типова поведінка — видалення) |
| Stack outputs | `UserPoolId`, `UserPoolClientId`, `HttpApiUrl` |

`RETAIN` застосовано лише до User Pool. App Client і група `teachers` не мають
явної політики збереження, тому під час видалення stack CloudFormation видаляє
їх. Після видалення stack і повторного deploy створюються нові Cognito-ресурси;
збережений User Pool не перевикористовується автоматично. Викладачів потрібно
повторно створити в новому User Pool (або явно імпортувати збережений pool) і
додати до групи `teachers`, а фронтенд — налаштувати на нові `UserPoolId` і
`UserPoolClientId`.

JWT authorizer налаштований на:

- issuer `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`;
- audience — ID публічного App Client;
- header `Authorization`.

Lambda приймає лише **access token** (`token_use === "access"`) і вимагає точну
групу `teachers`. ID token відхиляється з `401`, навіть якщо містить групу
`teachers`.

Cognito-акаунти студентів не створюються. Викладачів створює адміністратор
User Pool, після чого їх додають до групи `teachers`. `Username` під час
SRP-логіну має збігатися з фактичним username акаунта; email не є alias
автоматично.

Докладніше про login-потік:
[`docs/frontend-integration.md`](docs/frontend-integration.md#2-автентифікація-викладача).

## `GET /health`

Метод: `GET`

Шлях: `/health`

Авторизація: **публічна**.

Відповідь `200 OK`:

```json
{
  "status": "ok",
  "service": "struct-lab-backend"
}
```

Заголовок відповіді: `content-type: application/json`.

## `POST /students`

Метод: `POST`

Шлях: `/students`

Авторизація: **публічна**. Cognito-акаунт, JWT і група `teachers` не потрібні.

### Запит

```http
POST /students
Content-Type: application/json

{
  "fullName": "Іван Петренко",
  "group": "ІП-21"
}
```

Правила валідації:

- тіло має бути непорожнім JSON-об'єктом;
- `fullName` — рядок; після `trim()` довжина від 1 до 200 символів;
- `group` — рядок; після `trim()` довжина від 1 до 50 символів;
- зайві поля ігноруються;
- клієнт не може задати `studentId` або `createdAt` — сервер генерує їх сам.

Точні повідомлення `400 Bad Request`:

| Причина | `error` |
| --- | --- |
| Відсутнє або порожнє тіло | `Request body is required` |
| Невалідний JSON | `Request body must be valid JSON` |
| JSON не є об'єктом | `Request body must be a JSON object` |
| Відсутній/порожній/не строковий `fullName` | `fullName must be a non-empty string` |
| `fullName` задовгий | `fullName must be at most 200 characters` |
| Відсутній/порожній/не строковий `group` | `group must be a non-empty string` |
| `group` задовгий | `group must be at most 50 characters` |

Приклад `400`:

```json
{
  "error": "fullName must be a non-empty string"
}
```

### Успішна відповідь `201 Created`

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

`studentId` — UUID v4, `createdAt` — ISO 8601. Запис із такими самими полями
зберігається в DynamoDB.

### Помилки

`500 Internal Server Error` — без деталей DynamoDB або ініціалізації:

```json
{
  "error": "Internal server error"
}
```

У логи не записуються ПІБ, група, тіло запиту або токени. Для помилки
логується лише назва класу помилки.

## `GET /admin/students`

Метод: `GET`

Шлях: `/admin/students`

Авторизація: **Cognito access token** у заголовку
`Authorization: Bearer <accessToken>` і точна група `teachers`.

Запит проходить два рівні захисту:

1. API Gateway JWT authorizer перевіряє підпис, issuer та audience токена.
2. Lambda перевіряє `token_use === "access"` і наявність групи `teachers`.

Authorization виконується до валідації query-параметрів і до звернення до
DynamoDB.

### Query-параметри

- `limit` — необов'язковий; рядок із десяткових цифр; ціле число від `1` до
  `100`; за замовчуванням `20`;
- `cursor` — необов'язковий непрозорий токен наступної сторінки.

Некоректний `limit` повертає `400` з повідомленням
`limit must be an integer between 1 and 100`.

Порожній `cursor` повертає `400` з повідомленням `cursor must not be empty`.
Невалідний або задовгий cursor повертає `400` з повідомленням
`cursor is invalid`.

### Успішна відповідь `200 OK`

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

Кожен елемент містить рівно чотири поля: `studentId`, `fullName`, `group`,
`createdAt`. Зайві атрибути DynamoDB у відповідь не потрапляють.

Якщо є наступна сторінка, `nextCursor` містить рядок. Клієнт передає його назад
у параметрі `cursor`. Якщо сторінок більше немає — `null`.

### Помилки авторизації

| Ситуація | Статус |
| --- | --- |
| Відсутній, невалідний або прострочений JWT | `401` від API Gateway |
| ID token або інший `token_use` | `401` від Lambda: `{"error":"Unauthorized"}` |
| Access token без точної групи `teachers` | `403` від Lambda: `{"error":"Forbidden"}` |

Тіло `401` від API Gateway генерується самим API Gateway і може відрізнятися від
JSON-контракту застосунку. Фронтенд має орієнтуватися на статус, а не на
конкретний текст помилки.

### Пагінація та cursor

- Використовується DynamoDB `Scan` із `Limit`, `ExclusiveStartKey` і
  `LastEvaluatedKey`.
- Cursor — base64url-кодований DynamoDB key `{ "studentId": "..." }`.
- Формат вважається внутрішньою деталлю: клієнт не повинен його розбирати або
  конструювати.
- Максимальна довжина cursor — 512 символів.
- Перевіряється base64url-формат, JSON-структура, наявність лише ключа
  `studentId` і відповідність `studentId` формату UUID v4.
- Некоректний cursor повертає `400`, а не `500`.
- `Scan` **не гарантує стабільного сортування**. Порядок між сторінками не є
  бізнес-контрактом.
- Ліміт у 5000 записів на сторінку не реалізований, бо вимога не підтверджена.

## Безпека

- **Публічна реєстрація.** `POST /students` навмисно доступний без авторизації.
  Це означає, що будь-хто може створювати записи; rate limiting, WAF, CAPTCHA та
  перевірка особи студента не реалізовані.
- **CORS не налаштований.** Браузерні cross-origin запити до API не працюють,
  доки backend не додасть CORS і preflight-маршрути.
- **Адмін-доступ захищений двома рівнями:** API Gateway JWT authorizer і Lambda
  teacher guard.
- **Точна група `teachers`.** Перевірка чутлива до регістру; `Teachers`,
  `teachers-extra`, `admins,teachers` не дають доступу.
- **Лише access token.** ID token відхиляється, навіть якщо містить групу
  `teachers`.
- **Least privilege IAM.** Create Lambda має лише `dynamodb:PutItem`, List
  Lambda — лише `dynamodb:Scan`. Обидва дозволи обмежені ARN таблиці.
- `grantReadWriteData()` не використовується. Lambda не мають Cognito IAM
  дозволів.
- **ПІБ і токени не логуються.** У разі помилки логуються лише назва помилки та
  безпечне повідомлення. Authorization denials не логуються.
- **Помилки ініціалізації repository не розкриваються клієнту.** Відсутня
  `STUDENTS_TABLE_NAME` або збій створення repository повертає generic `500`.
- **Обмеження відкликання токенів.** Cognito access token не можна відкликати
  окремо; після виходу, зміни пароля або видалення з групи вже виданий token
  може залишатися дійсним до завершення 30-хвилинного терміну.
- **User Pool зберігається, DynamoDB видаляється.** `RETAIN` застосовано лише до
  Cognito User Pool. App Client і група `teachers` не мають явного `RETAIN`, тому
  під час видалення stack вони видаляються. Повторний deploy не перевикористовує
  збережений User Pool автоматично: створюються нові Cognito-ресурси, і
  викладачів треба знову створити в новому User Pool (або явно імпортувати
  збережений pool) та додати до групи `teachers`. Таблиця має `DESTROY` і
  вимкнений deletion protection; видалення stack знищить усі записи студентів.
- **Деплой не виконувався.** Реальні AWS-ресурси, підписи JWT і робота
  authorizer не перевірені integration-тестами.
- **Production hardening попереду:** rate limiting/WAF, CORS, identity
  verification, MFA, бекапи, PITR, deletion protection, моніторинг та аудит.

Історичні рішення Фази 2 збережені в
[`docs/phase-2-plan.md`](docs/phase-2-plan.md). Вони описують попередній стан і
не відображають поточний API.

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
- `test` — **10 тестових файлів, 162 тести пройшли**;
- `build` — тека `dist/` з `.js`, `.d.ts` і source maps;
- `synth` — `cdk.out/StructLabBackendStack.template.json` і попередження про
  видалення таблиці (це очікувано).

## Тестування

Тести не потребують AWS, DynamoDB, Cognito чи credentials. DynamoDB-репозиторій
підміняється через dependency injection, а JWT claims подаються як синтетичний
API Gateway event.

- `test/validation.test.ts` — валідація ПІБ, групи, `limit`, cursor.
- `test/cursor.test.ts` — round-trip, base64url, обмеження довжини, некоректні
  cursor.
- `test/create-student.test.ts` — публічні `201`, UUID, обрізання пробілів,
  base64 body, `400`, `500`, відсутність PII/токенів у логах.
- `test/list-students.test.ts` — limit за замовчуванням, кастомний limit,
  cursor, `nextCursor`, некоректні параметри, `401`/`403`, `500`, відсутність
  PII у логах.
- `test/students-repository.test.ts` — `PutCommand`, `ScanCommand` з `Limit` і
  `ExclusiveStartKey`, перетворення `LastEvaluatedKey`, порожні результати,
  поширення помилок DynamoDB.
- `test/handler-initialization.test.ts` — generic `500` без витоку внутрішніх
  деталей, якщо `STUDENTS_TABLE_NAME` відсутня.
- `test/handler-initialization-error.test.ts` — generic `500`, якщо створення
  repository завершується помилкою.
- `test/auth.test.ts` — malformed JWT context, ID token, точна група
  `teachers`, відсутність логування при відмові.
- `test/health.test.ts` — `GET /health`.
- `test/struct-lab-stack.test.ts` — DynamoDB, Cognito, три Lambda, IAM, три
  routes, JWT authorizer, відсутність OAuth/Hosted UI та outputs.

## Як працює `cdk synth`

1. CDK CLI читає `cdk.json` і запускає `bin/app.ts` через `ts-node`.
2. `StructLabStack` створює DynamoDB, Cognito, Lambda, IAM та HTTP API.
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
| Потрібен деплой | Не входить у Фазу 3. Потрібні AWS-акаунт, credentials, bootstrap і окреме рішення щодо production hardening. |

## Документація фаз

- [`docs/phase-2-plan.md`](docs/phase-2-plan.md) — історичний план Фази 2:
  DynamoDB, публічний `POST /students`, cursor-based пагінація та підготовка
  admin-обробника.
- [`docs/phase-3-plan.md`](docs/phase-3-plan.md) — фактична архітектура Фази 3:
  Cognito, JWT authorizer, teacher guard, публічна реєстрація та security review.
- [`docs/frontend-integration.md`](docs/frontend-integration.md) — точний
  контракт для фронтенду: запити, відповіді, помилки, пагінація, SRP-логін і
  обмеження CORS.

## Наступні кроки

1. Додати CORS для конкретного домену фронтенду.
2. Додати rate limiting, WAF і CAPTCHA для публічної реєстрації.
3. Реалізувати перевірку особи студента та захист від дублікатів.
4. Виконати dev-деплой і post-deploy integration-тести Cognito/API Gateway.
5. Посилити production-конфігурацію: MFA, явний retention lifecycle для Cognito
   App Client і групи `teachers` (або окремий stateful stack), deletion
   protection, PITR, бекапи, моніторинг та аудит.
