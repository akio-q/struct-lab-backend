# Фаза 3: Cognito, захищений admin-маршрут і публічна реєстрація

**Статус: реалізовано локально, без деплою в AWS.**

Цей документ описує фактичний стан Фази 3: архітектуру, модель авторизації,
API-контракт, інфраструктуру, тестове покриття та залишкові ризики. Він
ґрунтується на коді репозиторію, а не на початковому плані.

## 1. Мета і продуктові рішення

Кінцева модель доступу:

| Маршрут | Доступ |
| --- | --- |
| `GET /health` | Публічний |
| `POST /students` | Публічна реєстрація студента |
| `GET /admin/students` | Лише викладачі з Cognito access token і групою `teachers` |

Ключові рішення:

- студенти **не мають** Cognito-акаунтів і не входять у систему;
- публічна реєстрація лише створює запис у DynamoDB;
- викладачі автентифікуються через Cognito User Pool;
- адміністративний перегляд захищений і на рівні API Gateway, і в Lambda;
- публічних маршрутів для перегляду, редагування або видалення студентів
  немає;
- схема даних не змінювалася: `studentId`, `fullName`, `group`, `createdAt`.

У межах Фази 3 реалізовано:

- Cognito User Pool, публічний App Client, групу `teachers`;
- JWT authorizer для `GET /admin/students`;
- Lambda teacher guard із перевіркою access token і точної групи;
- публічний `POST /students` без JWT;
- CDK-тести інфраструктури та unit-тести авторизації;
- документацію для фронтенду.

Поза межами Фази 3:

- деплой у AWS і bootstrap;
- CORS;
- rate limiting, WAF, CAPTCHA;
- перевірка особи студента та захист від дублікатів;
- MFA та production hardening;
- зміна схеми або нові CRUD-операції.

## 2. Фінальна архітектура

```text
GET /health (публічний)
Клієнт ──► API Gateway HTTP API ──► Health Lambda ──► 200 JSON

POST /students (публічний)
Клієнт ──► API Gateway HTTP API ──► CreateStudent Lambda ──► DynamoDB PutItem
                                                              Students table

GET /admin/students (teacher-only)
Клієнт ──► API Gateway HTTP API
              │ JWT authorizer (Cognito)
              ▼
         ListStudents Lambda
              │ access token + exact teachers group
              ▼
         DynamoDB Scan ──► { items, nextCursor }
```

Інфраструктура складається з:

- однієї DynamoDB-таблиці `StudentsTable`;
- одного Cognito User Pool `TeachersUserPool`;
- одного публічного App Client без secret;
- однієї групи `teachers`;
- одного JWT authorizer;
- рівно трьох Lambda-функцій;
- рівно трьох HTTP-маршрутів.

## 3. Модель авторизації

### 3.1. Публічні маршрути

`GET /health` і `POST /students` не мають authorizer в API Gateway.
`POST /students` також не викликає Lambda teacher guard: handler одразу
переходить до валідації body та створення запису.

Публічна реєстрація не створює Cognito-користувача, не видає токен і не
перевіряє особу студента. Вона лише валідовує `fullName` і `group` та виконує
`PutItem`.

### 3.2. Захищений admin-маршрут

`GET /admin/students` захищений двома незалежними рівнями.

**Рівень 1 — API Gateway JWT authorizer:**

- джерело токена: заголовок `Authorization`;
- перевіряються підпис, issuer і audience;
- issuer — `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`;
- audience — публічний App Client User Pool;
- запит без валідного JWT відхиляється API Gateway з `401` до виклику Lambda.

**Рівень 2 — Lambda teacher guard:**

- витягує claims із `requestContext.authorizer.jwt.claims`;
- вимагає `token_use === "access"`;
- вимагає точну присутність групи `teachers` у `cognito:groups`;
- не довіряє типам event і перевіряє їх у runtime;
- підтримує як масив груп, так і серіалізований API Gateway рядок
  `"[teachers admins]"`;
- не розділяє назви груп комами: `"[admins,teachers]"` — це одна група з назвою
  `admins,teachers`, а не дві групи;
- перевіряє групу чутливо до регістру, без часткового збігу.

Порядок виконання:

```text
JWT authorizer → teacher guard → query validation → cursor validation
→ repository initialization (lazy) → DynamoDB
```

Після відмови repository не ініціалізується і не викликається.

### 3.3. Статуси авторизації

| Ситуація | Статус | Відповідь |
| --- | --- | --- |
| Відсутній, невалідний або прострочений JWT | `401` | генерує API Gateway |
| Немає або пошкоджений authorizer context у Lambda | `401` | `{"error":"Unauthorized"}` |
| ID token, refresh token або інший `token_use` | `401` | `{"error":"Unauthorized"}` |
| Access token без точної групи `teachers` | `403` | `{"error":"Forbidden"}` |
| Access token із групою `teachers` | далі до handler | `200`, `400` або `500` |

ID token відхиляється навіть тоді, коли містить `cognito:groups: ["teachers"]`.
Це навмисно: адміністративний API приймає лише access token.

API Gateway може відхилити токен раніше, ніж запит потрапить у Lambda. Тому
фронтенд має орієнтуватися на HTTP-статус, а не на конкретне тіло `401` від
API Gateway.

## 4. Cognito

| Параметр | Фактичне значення |
| --- | --- |
| User Pool | `TeachersUserPool` |
| Self-sign-up | вимкнено |
| Створення користувачів | лише адміністратором |
| Password policy | мінімум 12; lowercase, uppercase, digits, symbols |
| App Client | один публічний, без secret |
| Auth flows | SRP + refresh token |
| OAuth / Hosted UI | вимкнено |
| User Pool domain | не створюється |
| Callback/logout URLs | не налаштовані |
| Access token validity | 30 хвилин |
| Група | `teachers` |
| User Pool removal policy | `RETAIN` |
| App Client removal policy | не задано (типова поведінка — видалення) |
| Група `teachers` removal policy | не задано (типова поведінка — видалення) |

### 4.1. Обмеження конфігурації

- Немає self-sign-up і Hosted UI, тому фронтенд не може використовувати
  redirect-based OAuth. Потрібен SRP-логін через Cognito SDK.
- `USER_PASSWORD_AUTH` не увімкнений; доступний SRP-потік.
- Backend не має власного endpoint для логіну, refresh або logout. Усі токени
  видає Cognito безпосередньо фронтенду.
- Викладацькі акаунти створюються адміністратором User Pool і додаються до
  групи `teachers`. `Username` під час SRP-логіну має збігатися з фактичним
  username акаунта; email не є alias автоматично.
- `RETAIN` застосовано лише до User Pool; App Client і група `teachers` не
  зберігаються явно. Деталі — у розділі 6.3.
- Після зміни групи вже виданий access token може зберігати стару інформацію до
  завершення строку дії (до 30 хвилин).
- Cognito access token не можна відкликати окремо. Вихід із системи на
  фронтенді не анулює вже виданий access token.

### 4.2. Stack outputs

| Output | Призначення |
| --- | --- |
| `HttpApiUrl` | Базовий URL HTTP API |
| `UserPoolId` | ID User Pool для конфігурації фронтенду |
| `UserPoolClientId` | ID публічного App Client |

Після видалення stack і повторного deploy значення `UserPoolId` і
`UserPoolClientId` можуть змінитися. Не вважайте їх стабільними: новий deploy не
перевикористовує збережений User Pool автоматично і не відновлює викладацькі
акаунти в новому pool.

Детальний login-потік і приклад інтеграції:
[`frontend-integration.md`](frontend-integration.md).

## 5. API-контракт

Повний контракт із прикладами для клієнта:
[`frontend-integration.md`](frontend-integration.md).

### 5.1. `GET /health`

- публічний;
- `200 OK`;
- `{"status":"ok","service":"struct-lab-backend"}`.

### 5.2. `POST /students`

- публічний, без Cognito/JWT;
- приймає JSON-об'єкт із `fullName` і `group`;
- `fullName` після trim — 1–200 символів;
- `group` після trim — 1–50 символів;
- зайві поля ігноруються;
- сервер генерує `studentId` (UUID v4) і `createdAt` (ISO 8601);
- успіх — `201` із повним записом;
- помилка валідації — `400` із `error`;
- помилка DynamoDB або ініціалізації — generic `500`;
- PII, body і токени не логуються.

### 5.3. `GET /admin/students`

- потребує Cognito access token і групи `teachers`;
- `limit` — 1–100, за замовчуванням 20;
- `cursor` — непрозорий токен;
- успіх — `200` із `{ items, nextCursor }`;
- некоректний `limit`/`cursor` — `400`;
- відсутня авторизація — `401`;
- невірна група — `403`;
- помилка DynamoDB — generic `500`;
- порядок `Scan` нестабільний і не є контрактом;
- cursor має максимальну довжину 512 символів і перевіряється як UUID v4 key.

## 6. Дані та IAM

### 6.1. DynamoDB

| Параметр | Значення |
| --- | --- |
| Partition key | `studentId`, String |
| Billing mode | `PAY_PER_REQUEST` |
| Encryption | AWS managed key |
| Deletion protection | `false` |
| Removal policy | `DESTROY` |
| PITR/backups | не налаштовані |

Запис містить лише чотири поля:

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

### 6.2. IAM

| Lambda | Дозвіл | Ресурс |
| --- | --- | --- |
| CreateStudent | `dynamodb:PutItem` | ARN таблиці |
| ListStudents | `dynamodb:Scan` | ARN таблиці |
| Health | немає DynamoDB-дозволів | — |

`grantReadWriteData()` не використовується. Lambda не мають Cognito IAM
дозволів: перевірка JWT виконується API Gateway, а групи — за claims у event.

### 6.3. Політики видалення

- Cognito User Pool: `RETAIN` — сам pool залишається в AWS-акаунті після
  видалення stack.
- Cognito App Client і група `teachers`: явної політики `RETAIN` немає, тому
  CloudFormation видаляє їх разом зі stack. Членство в групі та client ID не
  зберігаються.
- Повторний deploy не перевикористовує збережений User Pool автоматично:
  створюються нові Cognito-ресурси. Викладачів треба знову створити в новому
  User Pool (або явно імпортувати збережений pool) і додати до групи
  `teachers`, а фронтенд — переналаштувати на нові `UserPoolId` і
  `UserPoolClientId`.
- DynamoDB: `DESTROY` — видалення stack знищує всі записи студентів.
- CDK додає warning annotation для таблиці.

Це конфігурація навчального середовища, а не production.

## 7. Безпека: що закрито і що залишилося

### 7.1. Закриті ризики

- Неавторизований доступ до списку студентів.
- Використання ID token замість access token.
- Частковий або регістронезалежний збіг групи.
- Обхід перевірки групи через кому або серіалізований рядок.
- Витік PII, токенів або внутрішніх деталей у логи та відповіді.
- Надмірні DynamoDB-дозволи.
- Випадкове створення Hosted UI/OAuth-конфігурації.
- Публічний admin-маршрут.

### 7.2. Залишкові ризики

1. **Spam і зловживання.** Публічний `POST /students` дозволяє будь-кому
   створювати записи. Немає rate limiting, WAF або CAPTCHA.
2. **Відсутність CORS.** Браузерні cross-origin запити не працюють; preflight
   `OPTIONS` не налаштований.
3. **Немає перевірки особи.** `fullName` і `group` — довільні рядки; немає
   підтвердження студента, унікальності або захисту від дублікатів.
4. **Немає idempotency key.** Повторний POST після мережевої помилки може
   створити дублікат.
5. **Обмежене відкликання токенів.** Access token діє до 30 хвилин; зміна групи
   не діє на вже виданий токен.
6. **Втрата даних.** DynamoDB має `DESTROY` і вимкнений deletion protection.
7. **Немає integration-тестів.** Реальні Cognito, API Gateway, DynamoDB і
   підписи JWT не перевірені.
8. **Немає production hardening.** MFA, моніторинг, алерти, аудит, бекапи та
   PITR не налаштовані.

## 8. Тести та перевірка

Тестове покриття Фази 3:

| Файл | Що перевіряє |
| --- | --- |
| `test/auth.test.ts` | malformed JWT context, ID token, точна група, відсутність console output при відмові |
| `test/create-student.test.ts` | публічний `201`, валідація, persistence, `500`, відсутність PII/токенів у логах |
| `test/list-students.test.ts` | пагінація, `400`, `401`, `403`, `500`, порядок авторизації |
| `test/handler-initialization.test.ts` | generic `500` без table env |
| `test/handler-initialization-error.test.ts` | generic `500` при збої repository |
| `test/struct-lab-stack.test.ts` | Cognito, authorizer, routes, IAM, Lambda, outputs |
| `test/validation.test.ts` | правила body та pagination |
| `test/cursor.test.ts` | формат і перевірка cursor |
| `test/students-repository.test.ts` | `PutCommand`, `ScanCommand`, помилки |
| `test/health.test.ts` | публічний health |

Разом: **10 тестових файлів, 162 тести**.

Локальні команди:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm synth
git diff --check
```

Усі команди проходять без помилок. `synth` не створює AWS-ресурсів; він лише
генерує CloudFormation-шаблон.

## 9. Критерії готовності Фази 3

- [x] `GET /health` публічний.
- [x] `POST /students` публічний і не потребує JWT.
- [x] Публічний POST валідовує body, генерує ID/час і зберігає запис.
- [x] `GET /admin/students` захищений JWT authorizer.
- [x] Lambda вимагає access token і точну групу `teachers`.
- [x] ID token відхиляється.
- [x] Відмова не ініціалізує repository.
- [x] PII та токени не потрапляють у логи.
- [x] Cognito має один pool, один public client і групу `teachers`.
- [x] OAuth та Hosted UI вимкнені.
- [x] IAM залишається least privilege.
- [x] Рівно три Lambda і три routes.
- [x] Є CDK-тести для публічних і захищеного маршрутів.
- [x] Локальні lint/typecheck/test/build/synth проходять.
- [ ] Деплой у AWS не виконувався.
- [ ] CORS, rate limiting і production hardening не реалізовані.

## 10. Наступні кроки

1. Додати CORS для конкретного origin фронтенду.
2. Додати rate limiting, WAF і CAPTCHA для публічної реєстрації.
3. Реалізувати перевірку особи студента та захист від дублікатів.
4. Розглянути idempotency key для повторних POST-запитів.
5. Виконати dev-деплой і post-deploy integration-тести.
6. Посилити production-конфігурацію: MFA, явний retention lifecycle для
   Cognito App Client і групи `teachers` (або окремий stateful stack),
   deletion protection, PITR, бекапи, моніторинг та аудит.
