# StructLab Backend

Бекенд навчального вебзастосунку **StructLab** — тренажера структур даних.

Поточна фаза — **Фаза 4**: підготовка dev-деплою та посилення безпеки. P4-01
фіксує цільовий AWS account, region, stack name і resource tags. P4-02.1–P4-02.4
додають request hardening, CORS, throttling і документування обмежень Lambda
concurrency.

> **Статус:** P4-01 і P4-02 (P4-02.1–P4-02.4) реалізовано й перевірено локально;
> P4-02.5 security review — PASS. P4-03.1 policy для даних, retention і recovery,
> P4-03.2 DynamoDB hardening, P4-03.3 Cognito lifecycle, P4-03.4 Cognito Token
> Security та P4-03.5 Cognito Account Security реалізовано й перевірено
> локально. Наступний запланований крок — P4-03.6 Final Review. Деплою в AWS,
> bootstrap, `cdk diff`, реальних integration-тестів, перевірки автентифікації,
> password history, account recovery та recovery Cognito ще не було. Акаунт
> залишається на AWS Free Plan; реальні грошові витрати не передбачені, але AWS
> credits можуть витрачатися.

## P4-03 roadmap

| Підзадача | Зміст | Статус |
| --- | --- | --- |
| P4-03.1 | Data Governance, Retention & Recovery | Виконано; review PASS |
| P4-03.2 | DynamoDB Hardening | Виконано; review PASS |
| P4-03.3 | Cognito Lifecycle | Змерджено в main через PR #3 |
| P4-03.4 | Cognito Token Security | Виконано локально; Code Review PASS; закомічено локально, не запушено і не змерджено |
| P4-03.5 | Cognito Account Security | Реалізовано локально; технічний review PASS; очікує фінального прийняття |
| P4-03.6 | Final Review | Наступна запланована |

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
- P4-01: dev-середовище зафіксовано в `lib/environments.ts` — account
  `677339799150`, region `eu-north-1`, stack `StructLabBackendStack-dev` і теги
  `Project`, `Service`, `Environment`, `ManagedBy`.
- P4-02.1: application-level request hardening для публічного `POST /students` —
  обов'язковий `Content-Type: application/json`, ліміт **4096 decoded bytes**,
  відповіді `413`/`415`, перевірки до запису в DynamoDB, без PII у логах.
- P4-02.2: native CORS на API Gateway HTTP API — точний origin
  `http://localhost:3000`, методи `GET`/`POST`, headers
  `content-type`/`authorization`, `AllowCredentials: false`, `MaxAge: 300`,
  без wildcard і без окремого `OPTIONS`-маршруту.
- P4-02.3: best-effort throttling на існуючому `$default` stage — `10 req/s`,
  burst `20`, `AutoDeploy: true`, без route-specific overrides.
- P4-02.4: документовано обмеження Lambda concurrency; reserved і provisioned
  concurrency, Lambda versions/aliases та quota increase свідомо не
  налаштовані, додано regression-тест.
- P4-03.2: `StudentsTable` має увімкнений deletion protection і best-effort
  ліміти on-demand throughput 25 RRU/s та 25 WRU/s; `RemovalPolicy.DESTROY`
  збережено.
- P4-03.3: `TeachersUserPool` явно використовує `FeaturePlan.ESSENTIALS` і
  deletion protection; User Pool зберігається через `RETAIN`, тоді як App Client
  і група `teachers` зберігають типову поведінку видалення.
- P4-03.4: App Client має access token **15 хвилин**, refresh token **7 днів** і
  явно увімкнений token revocation. Refresh-token rotation залишається
  вимкненим, ID token validity не змінюється (Cognito default — 60 хвилин).
- P4-03.5: User Pool має password history **5**, temporary password validity
  **3 дні** і **admin-only** account recovery. App Client приховує
  user-existence errors (`PreventUserExistenceErrors: ENABLED`).
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
- Per-IP rate limiting, WAF і CAPTCHA для публічної реєстрації.
- Lambda reserved і provisioned concurrency (свідоме рішення P4-02.4; див.
  розділ «Безпека»).
- CORS для задеплоєного HTTPS-домену фронтенду (зараз дозволений лише
  `http://localhost:3000`).
- Перевірки особи студента та захисту від дублікатів.
- Production hardening: MFA, бекапи, PITR, аудит.
- Перевірки frontend authentication і token-refresh flow після зміни TTL
  (P4-03.4 змінює лише backend-конфігурацію).
- Live-перевірки password history, temporary password expiry, admin-only
  account recovery і user-enumeration behavior.
- Адміністративна процедура recovery та frontend-обробка відповідних помилок
  (P4-03.5 не додає recovery API або UI).
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
  ├── password history 5; temporary password 3 дні
  ├── account recovery лише через адміністратора
  ├── access token 15 хвилин
  └── refresh token 7 днів (rotation вимкнено)
```

Діаграма відображає поточний стан після P4-03.5. Деталі конфігурації,
обмеження password history, temporary passwords і recovery описані в розділі
«Cognito».

Пояснення:

- **API Gateway HTTP API** приймає запити; `GET /health` і `POST /students`
  публічні, `GET /admin/students` захищений JWT authorizer.
- **Cognito** використовується лише викладачами. Студенти не мають
  Cognito-акаунтів.
- **JWT authorizer** перевіряє підпис, issuer і audience до виклику Lambda.
- **Lambda teacher guard** додатково вимагає access token (не ID token) і точну
  групу `teachers`.
- **DynamoDB** зберігає записи студентів; IAM обмежений однією таблицею.
- **Application-level request hardening:** `POST /students` вимагає
  `Content-Type: application/json` і обмежує decoded body до 4096 байт.
  Це не edge-level захист і не захист від спаму.
- **Throttling** налаштований на default stage: 10 req/s і burst 20. Це
  best-effort, не per-IP quota. **CORS** дозволяє лише `http://localhost:3000`
  для локального Next.js; preflight обробляє API Gateway.

## Структура проєкту

```text
struct-lab-backend/
├── bin/
│   └── app.ts                         # Точка входу CDK-застосунку
├── lib/
│   ├── environments.ts                # Pinned dev target, tags, CORS, throttling
│   └── struct-lab-stack.ts            # DynamoDB, Cognito, Lambda, IAM, API/CORS/throttling
├── src/
│   ├── constants.ts                   # Назва сервісу та група teachers
│   ├── handlers/
│   │   ├── health.ts                  # GET /health
│   │   ├── create-student.ts          # POST /students (публічний)
│   │   └── list-students.ts           # GET /admin/students (teacher-only)
│   ├── lib/
│   │   ├── auth.ts                    # JWT claims і teacher authorization
│   │   ├── errors.ts                  # Безпечне ім'я помилки для логів
│   │   └── http.ts                    # JSON-відповіді, headers і body helpers
│   └── students/
│       ├── cursor.ts                  # Кодування/перевірка cursor
│       ├── repository.ts              # DynamoDB PutItem/Scan
│       ├── types.ts                   # Student, CreateStudentInput, StudentCursor
│       └── validation.ts              # Валідація body та query-параметрів
├── test/
│   ├── helpers/
│   │   └── events.ts                  # Тестові API Gateway events
│   ├── health.test.ts                 # GET /health
│   ├── validation.test.ts             # Валідація body, limit і розміру
│   ├── http.test.ts                   # Header/body helpers
│   ├── cursor.test.ts                 # Формат і перевірка cursor
│   ├── create-student.test.ts         # Публічне створення, 400/413/415/500
│   ├── list-students.test.ts          # Пагінація, авторизація, помилки
│   ├── students-repository.test.ts    # PutCommand/ScanCommand
│   ├── handler-initialization.test.ts # Відсутня STUDENTS_TABLE_NAME
│   ├── handler-initialization-error.test.ts # Помилка створення repository
│   ├── auth.test.ts                   # JWT claims і teacher guard
│   ├── environments.test.ts           # Dev config, guard, CORS, throttling
│   └── struct-lab-stack.test.ts       # CDK: env, tags, IAM, routes, CORS, throttling
├── docs/
│   ├── deployment.md                  # Dev deployment, safeguards, rollback
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
| `bin/app.ts` | Створює CDK-застосунок, перевіряє target і додає `StructLabStack`. |
| `lib/environments.ts` | Фіксує dev account/region, stack name, tags і перевіряє розв'язаний AWS target. |
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
| `test/environments.test.ts` | Перевіряє pinned dev config і захист від неправильного account/region. |
| `test/struct-lab-stack.test.ts` | Перевіряє env, tags, DynamoDB, Cognito, IAM, три Lambda та три routes. |
| `docs/deployment.md` | Dev target, safeguards, локальні команди та майбутній rollback. |
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
| Deletion protection | увімкнено (`deletionProtection: true`, P4-03.2) |
| Max on-demand read | 25 RRU/s (`maxReadRequestUnits: 25`) |
| Max on-demand write | 25 WRU/s (`maxWriteRequestUnits: 25`) |
| Removal policy | `DESTROY` |
| Update replace policy | `Delete` |
| Point-in-time recovery | не налаштовано |

Це локально синтезована конфігурація P4-03.2; AWS deploy не виконувався.

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

Локально синтезована конфігурація P4-03.2 має `RemovalPolicy.DESTROY` **і**
увімкнений deletion protection. Deletion protection не дає CloudFormation
видалити таблицю, доки захист не вимкнено. Тому `cdk destroy` або rollback,
який вимагає видалення чи заміни таблиці, може завершитися помилкою.

Вимкнення deletion protection саме по собі не видаляє таблицю чи її записи; воно
лише дозволяє подальше авторизоване видалення таблиці. Успішне видалення таблиці
знищує збережені записи студентів. Вимкнення захисту та destructive operations
потребують окремого схвалення; export і перевірка мають передувати навмисному
видаленню.

Deletion protection **не є backup**: він не запобігає видаленню окремих items,
перезапису, пошкодженню або логічним помилкам і не захищає від втрати доступу
до AWS-акаунта. Export і перевірка мають передувати будь-якій навмисній
destructive operation; деталі — у розділі «Дані, retention і recovery» та
[`docs/deployment.md`](docs/deployment.md).

Для production потрібно:

- змінити removal policy на `RETAIN`;
- зберегти deletion protection;
- увімкнути point-in-time recovery та налаштувати бекапи;
- керувати таблицею через окремий production stack.

### On-demand throughput limits

- Максимум on-demand read — **25 RRU/s**, write — **25 WRU/s**.
- Це request units, а не гарантована кількість API-запитів. Споживання залежить
  від розміру item, типу операції та read consistency.
- `Scan` може споживати кілька read request units за один API-запит.
- Ліміти best-effort: burst capacity може тимчасово перевищувати їх.
- Це не per-user quotas і не жорсткі spending caps.
- API Gateway throttling (`10 req/s`, burst `20`) і Lambda concurrency — окремі
  контролі.
- DynamoDB throttling може проявлятися як наявні application error responses.
  `POST /students` не можна автоматично retry-ити, бо idempotency не
  реалізована. Існуюча AWS SDK retry behavior не змінюється.
- Локальний synth підтверджує конфігурацію, але не фактичну поведінку під
  навантаженням; throughput і throttling у AWS не тестувалися.

## Cognito

| Параметр | Значення |
| --- | --- |
| Логічна конструкція User Pool | `TeachersUserPool` |
| Feature plan | `ESSENTIALS` (явно) |
| Self-sign-up | вимкнено (`selfSignUpEnabled: false`) |
| Створення користувачів | лише адміністратором (`AllowAdminCreateUserOnly: true`) |
| Password policy | мінімум 12 символів; lowercase, uppercase, digits, symbols (без змін) |
| Password history | 5 (`PasswordHistorySize: 5`) |
| Temporary password validity | 3 дні (`TemporaryPasswordValidityDays: 3`) |
| Account recovery | лише адміністратор (`AccountRecovery.NONE` → `admin_only`) |
| User-existence errors | приховані (`PreventUserExistenceErrors: ENABLED`) |
| App Client | один публічний, без secret (`GenerateSecret: false`) |
| Auth flow | SRP (`ALLOW_USER_SRP_AUTH`) + refresh token (`ALLOW_REFRESH_TOKEN_AUTH`) |
| OAuth / Hosted UI | вимкнено; немає domain, callback URL, scopes |
| Access token | 15 хвилин |
| ID token | 60 хвилин (Cognito default; явно не задається) |
| Refresh token | 7 днів |
| Refresh-token rotation | вимкнено (`refreshTokenRotationGracePeriod` не задається) |
| Token revocation | увімкнено (`enableTokenRevocation: true`) |
| Група | `teachers` |
| Deletion protection User Pool | увімкнено (`DeletionProtection: ACTIVE`) |
| Removal policy User Pool | `RETAIN` |
| Removal policy App Client | не задано (типова поведінка — видалення) |
| Removal policy групи `teachers` | не задано (типова поведінка — видалення) |
| Stack termination protection | не ввімкнено |
| Stack outputs | `UserPoolId`, `UserPoolClientId`, `HttpApiUrl` |

Це локально синтезована конфігурація P4-03.5; AWS deploy не виконувався. CDK L2
нормалізує refresh token validity до хвилин, тому в CloudFormation шаблоні
`RefreshTokenValidity` дорівнює `10080` (`10080 / 60 / 24 = 7` днів), а
`TokenValidityUnits.RefreshToken` — `minutes`. Це та сама 7-денна тривалість, а не
інше значення.

### Password history, temporary passwords і recovery (P4-03.5)

- `passwordHistorySize: 5` синтезується як `PasswordHistorySize: 5`. Коли Cognito
  застосовує цю policy, останні п'ять паролів не можна повторно використати.
- Ця зміна **не скидає** наявні паролі автоматично і не робить їх історію
  заднім числом.
- `tempPasswordValidity: Duration.days(3)` синтезується як
  `TemporaryPasswordValidityDays: 3`. Тимчасовий пароль, створений
  адміністратором, діє три дні; після завершення строку потрібне втручання
  адміністратора.
- `accountRecovery: AccountRecovery.NONE` синтезується як
  `AccountRecoverySetting.RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }]`.
  Це вимикає self-service password recovery у Cognito.
- Викладачі мають звертатися до авторизованого адміністратора для recovery.
  Адміністратор потребує відповідних прав і окремо затвердженої процедури.
- `preventUserExistenceErrors: true` синтезується як
  `PreventUserExistenceErrors: ENABLED`. Це зменшує розкриття інформації про
  наявність акаунта, але не є гарантією проти всіх технік enumeration.
- Існуюча frontend-обробка помилок може потребувати перевірки, оскільки
  self-service recovery вимкнений.
- Реальні Cognito login, password reset, temporary-password expiry і frontend
  recovery flow не тестувалися.
- Administrative recovery API, frontend recovery UI, messaging infrastructure і
  automated account-management scripts не реалізовані.

### Lifecycle: RETAIN, deletion protection і stack termination protection

- `RemovalPolicy.RETAIN` зберігає User Pool, коли CloudFormation прибирає його з
  management під час видалення stack. Це не блокує явний `DeleteUserPool`.
- Cognito deletion protection блокує видалення User Pool, доки захист
  увімкнений. Вимкнення захисту саме по собі не видаляє pool або users; воно
  лише дозволяє подальше авторизоване видалення, яке прибирає pool і не дає його
  користувачам увійти.
- CloudFormation stack termination protection — окремий stack-level контроль.
  Він **не ввімкнений** і не замінює `RETAIN` або Cognito deletion protection.
- Вимкнення deletion protection, deactivation користувачів і видалення User Pool
  потребують окремого схвалення.
- Deletion protection не захищає окремих users від видалення або зміни, не є
  backup і не захищає від втрати доступу до AWS-акаунта.

`RETAIN` застосовано лише до User Pool. App Client і група `teachers` явної
політики збереження не мають, тому під час видалення stack CloudFormation
видаляє їх. Після успішного видалення stack:

- retained User Pool може залишитися поза CloudFormation management;
- users у ньому можуть залишитися;
- App Client і група `teachers` можуть бути видалені;
- membership у групі та конфігурацію client не можна вважати збереженими.

Новий deployment не перевикористовує retained pool автоматично; він створює нові
Cognito-ресурси. Новий App Client може вимагати повторної автентифікації.
Recovery потребує окремо схваленої процедури: імпорт або явне посилання на
retained pool, повторне створення client і групи, відновлення складу
`teachers`, оновлення frontend (`UserPoolId`, `UserPoolClientId`) і перевірка
authorization. Автоматичних import/migration/recovery scripts немає.

Retained resources можуть залишитися й після failed deployment або rollback.
Звичайне успішне видалення stack не гарантоване, доки DynamoDB deletion
protection залишається увімкненим; див. розділ «DynamoDB».

Cognito Essentials — затверджений tier; він підтримує password-history контроль
P4-03.5, реалізований локально. AWS публікує free allowance **10 000 MAU**
для eligible direct authentication. Право на free allowance та фактичний
billing конкретного акаунта треба перевірити до deployment. Retained User Pool і
users залишаються subject to AWS account lifecycle і applicable pricing; AWS
credits і free allowances не є необмеженими.

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

Поточна таблиця вище відображає реалізований стан P4-03.5.
Деталі policy — у розділі «Дані, retention і recovery».

Докладніше про login-потік:
[`docs/frontend-integration.md`](docs/frontend-integration.md#2-автентифікація-викладача).

## Дані, retention і recovery (P4-03.1)

> **Межі P4-03.1.** Це документаційна policy для dev. Вона не змінює CDK, IAM,
> DynamoDB, Cognito або AWS-ресурси. P4-03.2 DynamoDB hardening, P4-03.3 Cognito
> lifecycle, P4-03.4 Cognito Token Security і P4-03.5 Cognito Account Security
> реалізовано локально. Поточний стан стека описаний у розділах «DynamoDB» і
> «Cognito».

### Класифікація даних

За `src/students/types.ts` і `src/handlers/create-student.ts` запис студента
містить рівно чотири поля:

| Поле | Формат | Класифікація |
| --- | --- | --- |
| `studentId` | UUID v4, генерується сервером | Псевдонімний ідентифікатор; пов'язує записи, але сам по собі не ідентифікує людину |
| `fullName` | Рядок, 1–200 символів після `trim()` | Персональні дані; пряма ідентифікація |
| `group` | Рядок, 1–50 символів після `trim()` | Потенційний непрямий ідентифікатор у поєднанні з ПІБ |
| `createdAt` | ISO 8601 | Метадані; квазі-ідентифікатор у поєднанні з іншими полями |

- Dev призначений **лише для синтетичних даних**. Синтетичні імена, групи та
  request payloads **можуть** з'являтися в документації та test fixtures;
  приклади `Іван Петренко` і `ІП-21` — вигадані.
- Реальні імена, контактні дані, адреси, ідентифікатори студентів або інші
  персональні дані вносити заборонено. Вони не повинні з'являтися в Git
  commits, test fixtures, screenshots або shared reports. Синтетичні тестові
  значення в документації та fixtures дозволені.
- Credentials, passwords, tokens і AWS credentials не повинні з'являтися в
  student registration payloads, logs, Git, документації, fixtures,
  screenshots, reports або exports.
- Легітимна автентифікація через Cognito, авторизовані AWS CLI sessions і
  Bearer access token у заголовку `Authorization` дозволені; authentication
  behavior не змінюється.
- Заборонено додавати чутливі дані (стан здоров'я, фінанси, оцінки тощо) без
  окремого privacy/security review.
- ПІБ, група та тіло запиту не повинні потрапляти в application logs,
  **навіть якщо значення синтетичні**. Для помилок логується лише назва класу
  помилки; logging student data і request bodies заборонено.
- Публічний `POST /students` не може технічно enforce synthetic-only policy:
  endpoint приймає будь-який валідний payload. Дотримання policy залежить від
  процесу, review і дисципліни maintainer-ів, а не від runtime-перевірки.
- Dev **не схвалений** для обробки реальних персональних даних студентів.

### Retention policy

- Кожен запис видаляється за першою з двох подій:
  - досягнення **30 днів** з моменту створення, навіть якщо тестування ще
    триває;
  - завершення відповідного тестування, навіть якщо запис молодший за 30 днів.
- Активне тестування не продовжує 30-денний максимум.
- Уповноважений maintainer виконує ручний review **щодня**, поки існують
  тестові дані або експорти.
- Для кожного запису й експорту фіксується точний deletion deadline; окреме
  схвалення на видалення отримується до настання цього deadline.
- Cleanup виконується після кожного завершеного тестового циклу.
- Оригінальний 30-денний ліміт не перевищується за жодних обставин.
- Якщо експорт містить кілька записів, застосовується найраніший відповідний
  deletion deadline.
- Після очищення maintainer вручну перевіряє, що прострочені або завершені
  тестові записи відсутні.
- Зовнішні експорти мають той самий максимальний строк — 30 днів або до
  завершення тестування; після цього їх треба безпечно видалити.
- Повторний export не скидає 30-денний строк: він рахується від `createdAt`
  оригінального запису, а не від дати нового export.
- Restore не змінює оригінальний `createdAt` і не продовжує retention.
- Export retention не може продовжувати retention оригінальних записів;
  записи, які досягли або перевищили свій retention deadline, не
  відновлюються.
- Автоматичного cleanup, DynamoDB TTL, scheduled Lambda або іншої
  інфраструктури для retention у P4-03.1 немає.
- Це **операційна policy**, а не технічно забезпечений контроль. DynamoDB не
  видаляє записи автоматично; дотримання строку залежить від ручної процедури.
- Видалення даних в AWS потребує окремого схвалення; P4-03.1 не виконує AWS
  операцій.

Ручна процедура очищення:

1. Під час щоденного review визначити записи, які досягли 30 днів з моменту
   створення, і записи, чиє відповідне тестування завершено.
2. Переконатися, що для кожного запису спрацював хоча б один із двох тригерів:
   30-денний строк або завершення тестування. Активне тестування не є підставою
   залишити запис після 30 днів.
3. Зафіксувати точний deletion deadline для кожного запису й експорту та
   отримати окреме схвалення на AWS-операцію до його настання.
4. Видалити записи через схвалену operator-процедуру; окремого delete API або
   автоматизованого скрипта в репозиторії немає.
5. Повторно перевірити, що прострочені та завершені тестові записи відсутні.
6. Зафіксувати факт очищення без ПІБ, токенів або інших персональних даних.

### Export і recovery runbook

Процедура призначена для майбутніх окремо схвалених операцій. У P4-03.1 вона
**не виконувалася** і не перевірялася на задеплоєних AWS-ресурсах. Скрипти,
додаткові AWS-ресурси або нові IAM-права не створюються.

1. **Перевірка identity.** Перед будь-якою операцією перевірити AWS account,
   profile `structlab-dev`, region `eu-north-1`, stack `StructLabBackendStack-dev`
   і фактичну назву/ARN таблиці. Назву таблиці генерує CDK, тому її не можна
   вгадувати.
2. **Окреме схвалення.** Зафіксувати середовище, таблицю, обсяг експорту,
   місце зберігання, оператора і дату видалення. Окреме схвалення потрібне для
   export, restore і будь-якої destructive operation.
3. **Пауза записів.** Для узгодженого експорту зупинити тестові клієнти та
   скоординувати freeze записів. Публічний `POST /students` не має maintenance
   mode, тому технічної гарантії паузи немає.
4. **Paginated Scan.** Читати таблицю сторінками через `Scan` з `Limit` і
   `ExclusiveStartKey`/`LastEvaluatedKey`, доки `LastEvaluatedKey` не стане
   відсутнім. Для кожного item зберігати DynamoDB JSON із типами (`S`, `N`,
   `BOOL` тощо), не перетворюючи його на довільний plain JSON.
5. **Збереження типів та ID.** Не змінювати `studentId`, не генерувати нові
   UUID і не перетворювати типи під час експорту чи restore.
6. **Перевірка повноти.** Порахувати items, перевірити відсутність дублікатів
   `studentId`, наявність і типи чотирьох полів, формат UUID v4 і валідність
   `createdAt`. За можливості порівняти з окремим контрольним підрахунком або
   тестовим restore.
7. **Шифрування.** Зашифрувати експорт at rest до збереження; ключ зберігати
   окремо від даних. Не залишати plaintext у temp-файлах, Git або shared
   directories.
8. **Зберігання.** Зберігати експорт поза Git-репозиторієм і поза AWS-акаунтом,
   з доступом лише для вповноважених maintainer-ів. Не надсилати експорт у
   chat, email або публічні сховища.
9. **Restore.**
   - За замовчуванням відновлювати лише в перевірену **порожню** target-таблицю
     у тому самому account/region.
   - Перед restore перевірити checksum експорту.
   - Не відновлювати записи, які досягли або перевищили свій retention deadline.
   - За можливості зупинити інші записи в target-таблицю на час restore.
   - `PutItem` і `BatchWriteItem` можуть перезаписати наявні записи. Для
     запобігання overwrite використовувати conditional `PutItem` з
     `attribute_not_exists(studentId)`.
   - `BatchWriteItem` не підтримує per-item condition expressions.
   - Відновлення в non-empty таблицю потребує окремого схвалення та
     collision-handling strategy.
   - Для `UnprocessedItems` використовувати bounded retries with backoff; якщо
     failures persist — зупинитися й повідомити, не приховувати частковий
     restore.
10. **Перевірка restore.** Повторно порахувати записи, перевірити ключі, поля,
    типи й вибірку значень; переконатися, що зайвих або втрачених items немає.
11. **Очищення.** Видалити тимчасові plaintext-файли одразу після завершення.
    Після 30 днів або завершення тестування безпечно видалити експорт і ключ
    доступу; перевірити, що копій не залишилося.
12. **Обмеження.** `Scan` **не є point-in-time backup** і не дає snapshot
    isolation: під час конкурентних записів сторінки можуть містити неузгоджені
    або пропущені items. Процедура не замінює PITR, AWS Backup або
    transaction-level consistency.

### Recovery scenarios

- **Normal recovery within the current approved AWS development account.**
  Використовувати зовнішній export і restore у перевірену порожню або схвалену
  таблицю в account `677339799150`, region `eu-north-1`, після окремого
  схвалення. Це основний сценарій цього runbook.
- **Recovery after Free Plan expiration or loss of access to the original
  account.** In-account ресурси й Cognito можуть бути недоступними. Відновлення
  може потребувати окремо схваленого replacement dev environment. Цей документ
  **не дає дозволу** на deployment в інший AWS account або на Paid Plan upgrade.
- External export preserves student records, але не повний AWS environment: він
  не містить Cognito users, app client, групу `teachers`, IAM, API Gateway,
  Lambda, CloudFormation/CDK state або інші ресурси. Викладачів, клієнт і
  інфраструктуру треба створювати заново за окремо схваленим runbook.

### Видалення, rollback і deletion protection

Поточний локальний стан після P4-03.2 (AWS deploy не виконувався):

| Параметр | Поточний стек |
| --- | --- |
| `RemovalPolicy` | `DESTROY` |
| Deletion protection | увімкнено |
| Max on-demand read | 25 RRU/s |
| Max on-demand write | 25 WRU/s |
| Encryption | AWS managed key |
| PITR / AWS Backup / TTL | немає (deferred) |

- Deletion protection захищає таблицю від `DeleteTable`, але **не є backup**:
  він не запобігає видаленню окремих items, перезапису, пошкодженню або
  логічним помилкам і не дає можливості відновити дані.
- Із `RemovalPolicy.DESTROY` увімкнений deletion protection може блокувати
  видалення stack або rollback, який вимагає видалення/заміни таблиці. Це
  очікуваний запобіжник, а не автоматичне відновлення.
- Невдалий початковий deploy може потребувати окремо схваленого ручного
  recovery. Не можна автоматично видаляти або перестворювати таблицю, щоб
  “обійти” помилку deployment.
- Export і перевірка мають передувати будь-якій навмисній destructive
  операції.
- Вимкнення deletion protection потребує окремого схвалення; воно не видаляє
  таблицю чи записи, але дозволяє подальше авторизоване видалення таблиці, яке
  знищить збережені записи студентів.
- Ніколи не видаляйте і не перестворюйте таблицю автоматично для вирішення
  проблем deployment або rollback.

### AWS Free Plan і вартість

- Dev-середовище тимчасове й призначене лише для розробки.
- Закінчення AWS Free Plan або вичерпання credits може обмежити доступ до
  ресурсів акаунта.
- In-account ресурси, зокрема DynamoDB і Cognito, **не є постійною стратегією
  recovery**: після втрати доступу до акаунта вони можуть стати недоступними.
- Потрібні export-и треба створювати до втрати доступу.
- DynamoDB storage, reads і writes, а також ручні export/restore можуть
  витрачати AWS credits. Це не означає автоматичних грошових списань, але й не
  означає необмеженого безкоштовного використання.
- On-demand limits 25 RRU/s і 25 WRU/s не є hard spending caps і не гарантують
  нульового споживання credits; вони обмежують request units best-effort.
- Cognito Essentials — затверджений tier. AWS публікує free allowance 10 000 MAU
  для eligible direct authentication; eligibility і фактичний billing треба
  перевірити до deployment. Retained User Pool і users залишаються subject to
  account lifecycle і pricing; credits і free allowances не є необмеженими.
- P4-03.3, P4-03.4 і P4-03.5 не вмикають Plus, advanced security/threat
  protection, SMS/email MFA, managed login/Hosted UI, OAuth/domain, зовнішні
  identity providers, Lambda triggers, custom messaging, customer-managed KMS
  або SNS/SES.
- P4-03.1–P4-03.5 не додають PITR, AWS Backup, customer-managed KMS keys або
  іншу платну інфраструктуру.
- Paid Plan upgrade не передбачений.
- Документ не наводить цінових гарантій: фактичне споживання credits залежить
  від акаунта, регіону й майбутніх змін AWS.

### Прийняті обмеження P4-03.1–P4-03.5

- Retention policy не enforced автоматично; потрібне ручне очищення.
- Немає PITR, AWS Backup, DynamoDB TTL або автоматичного cleanup.
- Export/restore runbook не перевірений на задеплоєних AWS-ресурсах.
- DynamoDB deletion protection і throughput caps реалізовані локально в P4-03.2,
  але не перевірені в AWS.
- Cognito deletion protection і `RETAIN` реалізовані локально в P4-03.3, але не
  перевірені в AWS; lifecycle, authentication і recovery тести не виконувалися.
- Cognito token TTL, revocation і refresh behavior реалізовані локально в
  P4-03.4, але не перевірені в AWS. Уже видані токени не скорочуються заднім
  числом, а API Gateway не перевіряє revocation для access token.
- Password history, temporary password expiry, admin-only recovery і
  user-enumeration protection реалізовані локально в P4-03.5, але не перевірені
  в AWS. Наявні паролі не скидаються; затвердженої адміністративної recovery
  procedure і frontend recovery UI немає.
- App Client і група `teachers` не retained. Після видалення stack їх може бути
  видалено, а membership і client configuration не можна вважати збереженими.
- Dev не схвалений для реальних персональних даних.
- Free Plan є тимчасовим; зовнішній export — єдина практична стратегія recovery
  поза акаунтом.

### Production поза межами P4-03.1–P4-03.5

Наступні теми потребують окремого проєктування, privacy/security review і
схвалення:

- обробка реальних персональних даних студентів;
- production retention та erasure policy;
- production backup і disaster recovery;
- production removal/replacement policy;
- формальний access auditing;
- сильніша автентифікація викладачів і MFA;
- повний production privacy/security review.

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

- `Content-Type: application/json` обов'язковий. Допускається
  `application/json; charset=utf-8`; регістр назви заголовка й media type не
  має значення.
- Максимальний розмір тіла — **4096 decoded bytes**. Для UTF-8 рахуються
  байти, а не JavaScript-довжина рядка; для base64 тіло спершу декодується.
- Перевірки виконуються в порядку: `Content-Type` → розмір тіла → JSON parsing →
  валідація полів → запис у DynamoDB.
- Це **application-level** перевірки. API Gateway усе одно приймає більші
  payload до своїх platform limits; вони не є edge-level захистом, WAF або
  anti-spam механізмом.
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

Точні повідомлення `413` і `415`:

| Статус | Причина | `error` |
| --- | --- | --- |
| `415` | Відсутній або непідтримуваний `Content-Type` | `Content-Type must be application/json` |
| `413` | Тіло більше 4096 decoded bytes | `Request body must be at most 4096 bytes` |

Для `413` і `415` запис у DynamoDB не виконується. Тіло запиту не логується.

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
  Це означає, що будь-хто може створювати записи; per-IP rate limiting, WAF,
  CAPTCHA та перевірка особи студента не реалізовані.
- **Application-level request hardening.** `POST /students` вимагає
  `Content-Type: application/json` (з опційним `charset=utf-8`) і приймає не
  більше 4096 decoded bytes. Перевірки виконуються до JSON parsing і запису в
  DynamoDB; відповіді — `415` або `413` у стандартному JSON-форматі. Це не
  edge-level захист, не WAF і не захист від спаму: API Gateway усе одно
  приймає більші payload до platform limits, а per-IP лімітів немає.
- **Середовище зафіксовано.** `StructLabStack` явно pinned на account
  `677339799150` і region `eu-north-1`, відхиляє конфліктні `env`/`stackName`, а
  `bin/app.ts` перевіряє розв'язаний AWS target до синтезу. Це захист від
  випадкового деплою в інший акаунт або регіон, а не runtime-авторизація.
- **CORS налаштований для локального Next.js.** API Gateway має native CORS:
  точний origin `http://localhost:3000`, методи `GET` і `POST`, headers
  `content-type` і `authorization`, `MaxAge` 300 секунд,
  `AllowCredentials: false`. Wildcards, шляхи, query strings, fragments,
  credentials і trailing slashes відхиляються до синтезу
  (`assertValidCorsOrigins`); повідомлення про помилки не містять значення
  origin. Preflight `OPTIONS` обробляє API Gateway; окремого
  маршруту або Lambda-заголовків немає.
- **CORS — не авторизація.** Дозволений origin не дає прав на admin-маршрут:
  `GET /admin/students` усе одно вимагає Cognito access token. CORS також не є
  rate limiting, WAF або захистом від спаму.
- **Майбутній домен фронтенду.** Для задеплоєного Next.js треба додати його
  точний HTTPS origin у `DEV_ENVIRONMENT.corsAllowedOrigins`, перевірити локально
  і задеплоїти. Wildcard заборонений.
- **CORS для gateway-помилок.** Відповіді `401`/`403`/`429` і
  gateway-generated `500` від Lambda throttling можуть не містити
  CORS-заголовків, якщо їх генерує API Gateway, а не інтеграція. Це потребує
  post-deploy перевірки; локальні тести цього не підтверджують.
- **API Gateway throttling.** Default stage `$default` має
  `DefaultRouteSettings` з rate **10 req/s** і burst **20**. Перевищення
  повертає `429 Too Many Requests`. Це best-effort обмеження на рівні stage, а не
  per-IP або per-user quota: один клієнт може вичерпати спільний burst. Воно не
  гарантує hard limit і не є spending cap. Lambda reserved concurrency не
  налаштований. Повторний `POST /students` після `429` може створити дублікат,
  бо idempotency не реалізована.
- **Lambda concurrency — спільний account pool.** Станом на P4-02.4
  `aws lambda get-account-settings` для `eu-north-1` (profile `structlab-dev`,
  AWS Free Plan) показує `ConcurrentExecutions: 10`,
  `UnreservedConcurrentExecutions: 10`, `FunctionCount: 0` і
  `TotalCodeSize: 0`. Це account-specific snapshot, а не постійний ліміт AWS Free
  Plan: перед деплоєм квоту треба перевірити знову. Усі три Lambda-функції
  поділяють цей регіональний unreserved pool.
- **Reserved і provisioned concurrency свідомо не налаштовані.** P4-02.4 не
  додає reserved concurrency, provisioned concurrency, Lambda versions/aliases
  або запит на quota increase і не змінює конфігурацію Lambda. Reserved
  concurrency лише зменшує спільний pool, а provisioned concurrency є платною
  функцією; для dev достатньо best-effort API Gateway throttling.
- **Публічна реєстрація може вичерпати pool.** Сплеск `POST /students` здатен
  зайняти всі 10 unreserved executions, тому `GET /health` та admin-запити
  тимчасово теж можуть не виконуватися. API Gateway throttling (`10 req/s`,
  burst `20`) не гарантує concurrency isolation, per-IP fairness або hard
  spending cap.
- **Lambda throttling може давати `500`.** Якщо invocation відхилено через
  вичерпання concurrency, API Gateway може повернути gateway-generated `500`, а
  не `429`. Така відповідь може не містити CORS-заголовків. Фронтенд має
  обробляти її як тимчасову помилку й уникати агресивних retry, особливо для
  `POST /students`, де можливий дублікат.
- **Throttling і concurrency не перевірені в AWS.** Локальний synth підтверджує
  лише конфігурацію. Реальні `429`, `500` від Lambda throttling, поведінка під
  навантаженням і CORS-заголовки потребують контрольованої post-deploy
  перевірки.
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
- **Обмеження відкликання токенів.** App Client має увімкнений token
  revocation, але API Gateway JWT authorizer не перевіряє revocation для вже
  виданого access token. Після виходу, зміни пароля або видалення з групи такий
  token може залишатися дійсним до завершення 15-хвилинного терміну. Деталі — у
  підрозділі «Токени та відкликання (P4-03.4)».
- **Cognito User Pool зберігається, App Client і група — ні.** User Pool має
  `RETAIN` і deletion protection. Після успішного видалення stack pool може
  залишитися поза CloudFormation management, а users — у ньому; App Client і
  група `teachers` можуть бути видалені, тому membership і client configuration
  не можна вважати збереженими. Повторний deploy не перевикористовує pool
  автоматично. Вимкнення deletion protection саме по собі не видаляє pool або
  users, але дозволяє подальше авторизоване видалення, після якого users не
  зможуть увійти. Recovery — лише окремо схвалена процедура.
- **DynamoDB захищена, але не є backup.** Таблиця має `DESTROY` і deletion
  protection; stack deletion або rollback може завершитися помилкою. Вимкнення
  захисту не видаляє дані саме по собі, але дозволяє подальше авторизоване
  видалення таблиці, яке знищить усі записи студентів.
- **Деплой не виконувався.** Реальні AWS-ресурси, підписи JWT, автентифікація,
  Cognito lifecycle, password history, temporary-password expiry, account
  recovery і recovery сценарії не перевірені integration-тестами.
- **Production hardening попереду:** per-IP rate limiting, WAF, identity
  verification, MFA, перегляд Lambda concurrency/quota під навантаженням,
  бекапи, PITR, моніторинг та аудит.

### Токени та відкликання (P4-03.4)

- Token revocation явно увімкнений для існуючого App Client
  (`enableTokenRevocation: true`).
- Відкликання refresh token може унеможливити його подальше використання; це
  залежить від Cognito та фактичного клієнтського flow.
- Відкликання **не гарантує** негайного відхилення вже виданого й не простроченого
  JWT на рівні API Gateway JWT authorizer. Authorizer перевіряє підпис, issuer,
  audience та строк дії, але не звертається до revocation list.
- Коротший 15-хвилинний access token зменшує вікно, протягом якого такий token
  може залишатися дійсним.
- Frontend authentication і token-refresh logic у цій backend-задачі не
  змінювалися. Існуючу frontend-інтеграцію треба перевірити окремо до deployment.
- Після завершення refresh token користувачу може знадобитися повторний sign-in.
- Зменшення refresh token validity до 7 днів не гарантує заднім числом, що вже
  видані refresh tokens матимуть коротший строк; це стосується лише нових
  токенів, виданих після deployment нової конфігурації.
- Локальний synth підтверджує конфігурацію, але не реальну поведінку Cognito.

### Account security та recovery (P4-03.5)

- Password history **5**: коли Cognito застосовує policy, останні п'ять паролів
  не можна повторно використати.
- Ця зміна не скидає наявні паролі автоматично; вона не переписує історію
  паролів заднім числом.
- Temporary password validity — **3 дні**. Прострочений тимчасовий пароль
  потребує втручання адміністратора.
- `AccountRecovery.NONE` вимикає self-service password recovery у Cognito.
  Викладачі мають звертатися до авторизованого адміністратора.
- Адміністратор потребує відповідних прав і окремо затвердженої процедури
  recovery. Автоматичного recovery API або frontend UI немає.
- `PreventUserExistenceErrors: ENABLED` зменшує розкриття інформації про
  наявність акаунта, але не гарантує захист від усіх методів enumeration.
- Існуюча frontend-обробка помилок може потребувати перевірки; реальні Cognito
  login, password reset і recovery flows не тестувалися.
- Локальний synth підтверджує конфігурацію, але не поведінку Cognito у AWS.

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
- `test` — **12 тестових файлів, 242 тести пройшли**;
- `build` — тека `dist/` з `.js`, `.d.ts` і source maps;
- `synth` — `cdk.out/StructLabBackendStack.template.json` для стека
  `StructLabBackendStack-dev` і попередження про видалення таблиці (це
  очікувано).

## Тестування

Тести не потребують AWS, DynamoDB, Cognito чи credentials. DynamoDB-репозиторій
підміняється через dependency injection, а JWT claims подаються як синтетичний
API Gateway event.

- `test/validation.test.ts` — валідація ПІБ, групи, `limit`, cursor і
  invariant, що максимальне валідне тіло менше за 4096 байт.
- `test/http.test.ts` — case-insensitive header lookup, JSON `Content-Type`,
  base64/UTF-8 decoding і вимірювання розміру тіла в байтах.
- `test/cursor.test.ts` — round-trip, base64url, обмеження довжини, некоректні
  cursor.
- `test/create-student.test.ts` — публічні `201`, UUID, обрізання пробілів,
  base64 body, `400`, `413`, `415`, межі 4095/4096/4097 байт, `500`,
  відсутність PII/токенів у логах.
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
- `test/environments.test.ts` — pinned dev account/region/stack/tags, CORS
  allowlist і валідація origin (wildcard, path, query, fragment, credentials,
  дублікати, HTTP поза localhost), відсутність credentials у повідомленнях,
  throttling (10 req/s, burst 20) і відхилення невалідних rate/burst,
  deployment guard для неправильного target.
- `test/health.test.ts` — `GET /health`.
- `test/struct-lab-stack.test.ts` — env, resource tags, захист від конфліктного
  target, DynamoDB, Cognito, три Lambda, IAM, три routes, JWT authorizer,
  native CORS (`AllowOrigins`, `AllowMethods`, `AllowHeaders`, `MaxAge`,
  `AllowCredentials`), throttle на існуючому default stage (rate 10, burst 20,
  `$default`, `AutoDeploy`, незмінний logical ID), відсутність
  route-specific overrides, Lambda reserved і provisioned concurrency
  (versions/aliases), відсутність OAuth/Hosted UI, `OPTIONS`-route та outputs.

## Середовище dev

| Параметр | Значення |
| --- | --- |
| AWS account | `677339799150` |
| AWS region | `eu-north-1` |
| AWS CLI profile | `structlab-dev` |
| AWS plan | AWS Free Plan |
| Environment | `dev` |
| Stack name | `StructLabBackendStack-dev` |
| Джерело істини | `lib/environments.ts` |

Stack явно pinned на цей account/region і застосовує теги `Project`,
`Service`, `Environment` і `ManagedBy`. Деталі, safeguards, локальні команди та
майбутні кроки деплою: [`docs/deployment.md`](docs/deployment.md).

## Як працює `cdk synth`

1. CDK CLI читає `cdk.json` і запускає `bin/app.ts` через `ts-node`.
2. `bin/app.ts` перевіряє розв'язаний AWS target через
   `assertDeploymentTarget()`, CORS allowlist через `assertValidCorsOrigins()` і
   throttling через `assertValidThrottling()`, після чого передає
   `DEV_ENVIRONMENT` у стек.
3. `StructLabStack` фіксує `env`, stack name і resource tags та створює
   DynamoDB, Cognito, Lambda, IAM і HTTP API з CORS і throttling.
4. `NodejsFunction` збирає кожен обробник через esbuild.
5. AWS SDK для DynamoDB включається в бандл Lambda, щоб не залежати від версії
   SDK у runtime.
6. CDK формує CloudFormation-шаблон у `cdk.out/`.

`synth` не створює ресурсів в AWS, не завантажує файли в S3 і не потребує
AWS-ключів. Stack має фіксовані `account`/`region`; без credentials локальний
`pnpm synth` працює, а якщо CDK CLI розв'язав credentials іншого акаунта або
регіону, app зупиняється до синтезу. Перевірити назву стека без деплою:
`pnpm exec cdk ls` → `StructLabBackendStack (StructLabBackendStack-dev)`.

## Можливі проблеми

| Проблема | Рішення |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: esbuild` | `pnpm approve-builds --all`. |
| Тест CDK падає за таймаутом | Перший бандл AWS SDK повільніший; таймаут у тесті — 60 секунд. |
| `cdk synth` показує WARNING про видалення таблиці | Це навмисне попередження для навчального середовища. |
| `cdk synth` пише про feature flags | Інформаційне повідомлення, не помилка. |
| `pnpm synth` не знаходить `ts-node` | Виконати `pnpm install`. |
| `Refusing to synthesize StructLab dev ...` | Активні credentials вказують на інший account/region. Використайте profile `structlab-dev` або очистіть `CDK_DEFAULT_ACCOUNT`/`CDK_DEFAULT_REGION` для локального synth. |
| Потрібен деплой | AWS deployment не входить у P4-02 і потребує окремого схвалення. Див. [`docs/deployment.md`](docs/deployment.md); потрібні AWS CLI/SSO, bootstrap і post-deploy перевірки. |

## Документація фаз

- [`docs/deployment.md`](docs/deployment.md) — dev target, environment
  safeguards, локальні перевірки, майбутній деплой і rollback.
- [`docs/phase-2-plan.md`](docs/phase-2-plan.md) — історичний план Фази 2:
  DynamoDB, публічний `POST /students`, cursor-based пагінація та підготовка
  admin-обробника.
- [`docs/phase-3-plan.md`](docs/phase-3-plan.md) — фактична архітектура Фази 3:
  Cognito, JWT authorizer, teacher guard, публічна реєстрація та security review.
- [`docs/frontend-integration.md`](docs/frontend-integration.md) — точний
  контракт для фронтенду: запити, відповіді, помилки, пагінація, SRP-логін,
  CORS і throttling.

## Наступні кроки

1. P4-03.3 Cognito lifecycle, P4-03.4 Cognito Token Security і P4-03.5 Cognito
   Account Security виконано локально; наступний запланований крок — P4-03.6
   Final Review. Подальші інфраструктурні зміни потребують окремого схвалення.
   Для майбутнього деплою потрібні AWS CLI/SSO, перевірка target і bootstrap
   після окремого схвалення.
2. Додати HTTPS-origin задеплоєного фронтенду в `corsAllowedOrigins`.
3. Додати per-IP rate limiting, WAF і CAPTCHA для публічної реєстрації.
4. Перед деплоєм повторно перевірити Lambda account quotas; reserved і
   provisioned concurrency свідомо не налаштовувати (рішення P4-02.4).
5. Реалізувати перевірку особи студента та захист від дублікатів.
6. Виконати dev-деплой і post-deploy integration-тести Cognito/API Gateway,
   включно з автентифікацією, authorization, throttling `429` і контрольованим
   вичерпанням Lambda concurrency.
7. Посилити production-конфігурацію: MFA, явний retention lifecycle для Cognito
   App Client і групи `teachers` (або окремий stateful stack), PITR, бекапи,
   моніторинг та аудит.
