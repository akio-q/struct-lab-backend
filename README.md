# StructLab Backend

Бекенд навчального вебзастосунку **StructLab** — тренажера структур даних.

**P4-07.7.5b — ручне розгортання в AWS завершено.** Публічна реєстрація та
захищений список студентів доступні за базовим URL
`https://tstq9li2el.execute-api.eu-north-1.amazonaws.com`. Усі дев’ять
функціональних сценаріїв на розгорнутому бекенді пройшли (**9/9 PASS**).

Оператор відклав E2E-10 (**DEFERRED BY OPERATOR**): два синтетичні записи
студентів та один тестовий користувач без групи `teachers` збережені для
інтеграції фронтенду. Інтеграція — **PENDING**.

## Розгорнуте середовище dev

| Параметр | Значення |
| --- | --- |
| AWS account | `677339799150` |
| Region | `eu-north-1` |
| API type | API Gateway HTTP API |
| API ID | `tstq9li2el` |
| Base URL | `https://tstq9li2el.execute-api.eu-north-1.amazonaws.com` |
| Stage | `$default` |
| Throttling | rate 10 requests/second, burst 20 |
| DynamoDB table | `StructLabStudents-dev`; `studentId`; provisioned 10 RCU / 10 WCU; deletion protection enabled |
| Cognito User Pool | `eu-north-1_5v0nXILuU` |
| App Client | `structlab-dev-client` / `5abaa8u50uj7c4eii44goh2t2a`; no secret |
| Sign-in identifier | **email** |
| Створення користувачів / MFA | Лише адміністратором; MFA `OFF` |
| Teacher group | exact case-sensitive `teachers` |
| Deployment method | Manual AWS CLI deployment; no CloudFormation/CDK stack |

Через обмеження AWS Free Plan на створення стека CloudFormation бекенд
розгорнули вручну. За останнім аудитом (P4-07.6) план був `ACTIVE`; поточний
баланс кредитів і витрати в P4-07.7.5b не перевіряли.
Див. [історію розгортання та результати перевірок](docs/manual-deployment.md)
і [контракт для фронтенду](docs/frontend-integration.md).

### Live verification status

| Перевірка | Результат |
| --- | --- |
| E2E-01–E2E-09 | **9/9 PASS** |
| E2E-10 safe cleanup | **DEFERRED BY OPERATOR**; not executed |
| Registration validation | 10/10 PASS |
| Protected query validation | 8/8 PASS |
| Combined validation cases | 18/18 PASS |
| Original E2E checklist | 9 PASS, 1 DEFERRED |
| Frontend integration | PENDING |
| Deletion permissions and behavior | Unverified |
| Throttling `429` / Lambda-throttling `500` load behavior | Not tested |

No AWS, API, authentication, or deletion operation was performed for the
P4-07.7.5b documentation checkpoint.

## P4-03 roadmap

| Підзадача | Зміст | Статус |
| --- | --- | --- |
| P4-03.1 | Data Governance, Retention & Recovery | Змерджено в main |
| P4-03.2 | DynamoDB Hardening | Змерджено в main |
| P4-03.3 | Cognito Lifecycle | Змерджено в main через PR #3 |
| P4-03.4 | Cognito Token Security | Змерджено в main через PR #4 |
| P4-03.5 | Cognito Account Security | Змерджено в main через PR #4 |
| P4-03.6 | Final Review | Змерджено в main через PR #4 (`8314271`) |

## Observability та cost control (P4-04 — CDK reference, not deployed)

P4-04 Observability & Cost Control реалізовано в CDK reference. Manual
deployment **не створював** ці CloudWatch Log Groups та alarms: deployed Lambda
execution roles не мають CloudWatch Logs permissions, тому function logs
недоступні. Наведене нижче описує CDK reference, а не live стан.

- Три explicit CloudWatch Log Groups для існуючих Lambda мають retention
  **7 днів** і `RemovalPolicy.DESTROY`; видалення CloudFormation resource
  видаляє історію відповідного log group.
- Чотири standard-resolution alarms: `Errors` для health, create-student і
  list-students Lambda та `5xx` для HTTP API (namespace `AWS/ApiGateway`,
  dimensions `ApiId` і `Stage`).
- Alarm-и не мають SNS, email, alarm actions або automatic notifications.
  Перевірка стану виконується вручну в CloudWatch.
- AWS Budgets, dashboards, custom metrics, detailed API Gateway metrics,
  high-resolution metrics та додаткові logging services не додані.
- CloudWatch Logs ingestion/storage і standard alarms можуть витрачати AWS
  credits після free allowance; нульова вартість не гарантується.
- Manual deployment не створював ці log groups/alarms. Перед будь-якою
  майбутньою infrastructure change перевірити AWS Free Plan, Billing і credits,
  CloudWatch quotas та актуальні Lambda/API quotas. Ручний AWS Budget
  перевіряється після окремого схвалення; budget resource у CDK reference
  відсутній.
- Логи не повинні містити ПІБ студентів, request bodies, токени або інші
  чутливі дані; logging payloads не змінювалися.
- P4-05 і P4-06 — історичні етапи підготовки. Manual AWS deployment виконано в
  P4-07; наступний крок — **P4-08 Final Review, Commit, Pull Request and
  Merge**, лише після окремого схвалення.

## Поточний API

Live base URL: `https://tstq9li2el.execute-api.eu-north-1.amazonaws.com`.
Шляхи вказуються без завершального слеша.

| Метод і шлях | Авторизація | Призначення |
| --- | --- | --- |
| `GET /health` | Публічний | Перевірка доступності сервісу |
| `POST /students` | Публічний | Реєстрація студента без Cognito-акаунта |
| `GET /admin/students` | Cognito **access token** + група `teachers` | Перегляд студентів із cursor-based пагінацією |

Викладач входить у Cognito зі своєю **email-адресою** (live
`UsernameAttributes=[email]`). ID token не підходить для `/admin/students`.

Детальний контракт для фронтенду:
[`docs/frontend-integration.md`](docs/frontend-integration.md).

## Що реалізовано

- **Ручне розгортання (P4-07).** До наявного HTTP API під’єднано три
  Lambda-функції з окремими IAM-ролями. Для захищеного маршруту використано
  наявний Cognito JWT authorizer, для записів студентів створено таблицю
  `StructLabStudents-dev`. Цими ресурсами не керує CloudFormation.
- **AWS CDK reference stack** (`lib/struct-lab-stack.ts`) з DynamoDB-таблицею,
  Cognito User Pool, трьома Lambda, HTTP API, JWT authorizer, least-privilege
  IAM і stack outputs. Це reference-дизайн; він **не деплоївся**.
- P4-01: dev-середовище зафіксовано в `lib/environments.ts` — account
  `677339799150`, region `eu-north-1`, stack `StructLabBackendStack-dev` і теги
  `Project`, `Service`, `Environment`, `ManagedBy`.
- P4-02.1: application-level request hardening для публічного `POST /students` —
  обов'язковий `Content-Type: application/json`, ліміт **4096 decoded bytes**,
  відповіді `413`/`415`, перевірки до запису в DynamoDB, без PII у логах.
  Live validation: **10/10 PASS**.
- P4-02.2: native CORS на API Gateway HTTP API — точний origin
  `http://localhost:3000`, методи `GET`/`POST`, headers
  `content-type`/`authorization`, `AllowCredentials: false`, `MaxAge: 300`,
  без wildcard і без окремого `OPTIONS`-маршруту.
- P4-02.3: best-effort throttling на існуючому `$default` stage — `10 req/s`,
  burst `20`, `AutoDeploy: true`, без route-specific overrides.
- P4-02.4: документовано обмеження Lambda concurrency; reserved і provisioned
  concurrency, Lambda versions/aliases та quota increase свідомо не
  налаштовані, додано regression-тест.
- P4-03.2 (**CDK reference**): `StudentsTable` має увімкнений deletion protection
  і best-effort ліміти on-demand throughput 25 RRU/s та 25 WRU/s;
  `RemovalPolicy.DESTROY` збережено. Live manual table uses provisioned
  **10 RCU / 10 WCU** instead.
- P4-03.3 (**CDK reference**): `TeachersUserPool` явно використовує
  `FeaturePlan.ESSENTIALS` і deletion protection; User Pool зберігається через
  `RETAIN`, тоді як App Client і група `teachers` зберігають типову поведінку
  видалення.
- P4-03.4 (налаштування також підтверджено в розгорнутому App Client):
  access token **15 хвилин**, ID token
  **60 хвилин**, refresh token **7 днів**, увімкнений token revocation,
  refresh-token rotation вимкнений.
- P4-03.5 (**CDK reference**): User Pool має password history **5**, temporary
  password validity **3 дні** і **admin-only** account recovery. Live pool
  differs: password history not configured, temporary password **7 днів**,
  recovery через verified email + verified phone. App Client приховує
  user-existence errors (`PreventUserExistenceErrors: ENABLED`).
- **Live Cognito:** email sign-in (`UsernameAttributes=[email]`), OAuth code flow
  and domain enabled; configured callback `https://d84l1y8p4kdic.cloudfront.net`
  is Cognito Managed Login's default redirect page, not the StructLab frontend.
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

- Frontend integration: **PENDING**. Реальний StructLab frontend ще не
  інтегрований і не перевірений; Cognito Managed Login's default redirect page
  не є frontend integration.
- E2E-10 safe cleanup: **DEFERRED BY OPERATOR**. Deletion permissions і
  deletion behavior не перевірені.
- Per-IP rate limiting, WAF і CAPTCHA для публічної реєстрації.
- Lambda reserved і provisioned concurrency (свідоме рішення P4-02.4; див.
  розділ «Безпека»).
- CORS для задеплоєного HTTPS-домену фронтенду (зараз дозволений лише
  `http://localhost:3000`).
- Перевірки особи студента та захисту від дублікатів. Реєстрація не є
  idempotent.
- Production hardening: MFA, бекапи, PITR, аудит.
- Перевірки frontend authentication і token-refresh flow у реальному frontend.
- Live-перевірки password change, password reset, temporary-password expiry,
  account recovery і user-enumeration behavior. Live Cognito values
  відрізняються від CDK reference.
- Адміністративна процедура recovery та frontend-обробка відповідних помилок
  (recovery API або UI не реалізовані).
- Пагінації по 5000 записів — вимога ще не підтверджена.
- Контрольована перевірка `429` і gateway-generated `500` від Lambda
  throttling під навантаженням.

## Архітектура

```text
GET /health (публічний)
Клієнт ──► API Gateway HTTP API ──► Health Lambda ──► 200 JSON

POST /students (публічний)
Клієнт ──► API Gateway HTTP API ──► CreateStudent Lambda ──► DynamoDB PutItem
                                                              StructLabStudents-dev

GET /admin/students (лише викладачі)
Клієнт ──► API Gateway HTTP API
              │ JWT authorizer: підпис, issuer, audience
              ▼
         ListStudents Lambda
              │ перевірка access token + групи teachers
              ▼
         DynamoDB Scan ──► { items, nextCursor }

Cognito User Pool (eu-north-1_5v0nXILuU)
  ├── self-sign-up вимкнено
  ├── email sign-in (UsernameAttributes=[email])
  ├── один публічний App Client без secret
  ├── SRP + OAuth code flow
  ├── група teachers
  ├── password history не налаштована; temporary password 7 днів
  ├── recovery через verified email + verified phone
  ├── access token 15 хвилин
  └── refresh token 7 днів (rotation вимкнено)
```

Діаграма відображає live manual deployment. CDK reference відрізняється
password policy, password history, temporary password validity, recovery,
OAuth/domain і throughput; ці відмінності описані в розділах «DynamoDB» і
«Cognito».

Пояснення:

- **API Gateway HTTP API** приймає запити; `GET /health` і `POST /students`
  публічні, `GET /admin/students` захищений JWT authorizer.
- **Cognito** автентифікує користувачів для захищеного маршруту. Реєстрація
  студента не створює Cognito-акаунта.
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
│   ├── manual-deployment.md           # Manual AWS deployment runbook (live)
│   ├── deployment.md                  # CDK reference deployment, safeguards, rollback
│   ├── phase-2-plan.md                # Історичний план Фази 2
│   ├── phase-3-plan.md                # Історичний план Фази 3
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
| `docs/manual-deployment.md` | Фактичний manual AWS deployment: live resources, E2E evidence, retained data і cleanup runbook. |
| `docs/deployment.md` | CDK reference deployment, safeguards, локальні команди та майбутній rollback; не відображає live manual deployment. |
| `docs/phase-3-plan.md` | Рішення, архітектура, безпека та межі Фази 3 (історичний документ). |
| `docs/frontend-integration.md` | Точний контракт для фронтенду: live URL, email sign-in, auth, пагінація, помилки та CORS. |
| `cdk.json` | Каже CDK CLI запускати `bin/app.ts` і складати результат у `cdk.out/`. |
| `tsconfig.json` | Strict TypeScript для всього проєкту. |
| `tsconfig.build.json` | Компіляція `bin/`, `lib/`, `src/` у `dist/` без тестів. |
| `vitest.config.mts` | Тести лежать у `test/**/*.test.ts`. |
| `pnpm-workspace.yaml` | Дозволяє esbuild виконати build-скрипт. |

## DynamoDB

Робоча таблиця — **`StructLabStudents-dev`**. Її створено вручну; жоден стек
CloudFormation не керує нею.

| Параметр | Live значення |
| --- | --- |
| Table name | `StructLabStudents-dev` |
| Partition key | `studentId` (String) |
| Billing mode | Provisioned |
| Capacity | 10 RCU / 10 WCU |
| Encryption | AWS-owned key (default) |
| Deletion protection | увімкнено |
| Point-in-time recovery | не налаштовано |
| TTL | не налаштовано |
| GSIs / LSIs, streams, replicas | немає |

CDK reference (`StudentsTable`) відрізняється: фізичну назву генерує CDK, а
throughput — on-demand 25 RRU/s і 25 WRU/s. Цей reference **не деплоївся**.

| CDK reference | Значення |
| --- | --- |
| Logical construct | `StudentsTable` |
| Physical name | generated by CDK |
| Billing mode | `PAY_PER_REQUEST` (on-demand) |
| Max on-demand read | 25 RRU/s (`maxReadRequestUnits: 25`) |
| Max on-demand write | 25 WRU/s (`maxWriteRequestUnits: 25`) |
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

Live table `StructLabStudents-dev` має увімкнений deletion protection. Вона не
належить CloudFormation, тому `cdk destroy` нею не керує. CDK reference
додатково має `RemovalPolicy.DESTROY`; для задеплоєного CDK stack `cdk destroy`
або rollback, який вимагає видалення чи заміни таблиці, може завершитися
помилкою, доки захист не вимкнено.

Вимкнення deletion protection саме по собі не видаляє таблицю чи її записи; воно
лише дозволяє подальше авторизоване видалення таблиці. Успішне видалення таблиці
знищує збережені записи студентів. Вимкнення захисту та destructive operations
потребують окремого схвалення; export і перевірка мають передувати навмисному
видаленню.

Deletion protection **не є backup**: він не запобігає видаленню окремих items,
перезапису, пошкодженню або логічним помилкам і не захищає від втрати доступу
до AWS-акаунта. Export і перевірка мають передувати будь-якій навмисній
destructive operation; деталі — у розділі «Дані, retention і recovery» та
[`docs/manual-deployment.md`](docs/manual-deployment.md#10-deferred-cleanup-and-retained-test-data).

Для production потрібно:

- змінити removal policy на `RETAIN`;
- зберегти deletion protection;
- увімкнути point-in-time recovery та налаштувати бекапи;
- керувати таблицею через окремий production stack.

### Throughput limits (live provisioned vs CDK reference)

- **Live table:** provisioned **10 RCU / 10 WCU**. Це не on-demand режим і не
  spending cap; `Scan` може споживати кілька read capacity units за один
  API-запит.
- **CDK reference:** максимум on-demand read — **25 RRU/s**, write — **25 WRU/s**.
- Це request units, а не гарантована кількість API-запитів. Споживання залежить
  від розміру item, типу операції та read consistency.
- Ліміти best-effort: burst capacity може тимчасово перевищувати їх.
- Це не per-user quotas і не жорсткі spending caps.
- API Gateway throttling (`10 req/s`, burst `20`) і Lambda concurrency — окремі
  контролі.
- DynamoDB throttling може проявлятися як наявні application error responses.
  `POST /students` не можна автоматично retry-ити, бо idempotency не
  реалізована. Існуюча AWS SDK retry behavior не змінюється.
- Live throughput і throttling під навантаженням **не тестувалися**; контрольована
  перевірка потребує окремого схвалення.

## Cognito

| Параметр | Live значення |
| --- | --- |
| User Pool ID | `eu-north-1_5v0nXILuU` |
| User Pool name | `User pool - nobwzm` |
| Feature plan | `ESSENTIALS` |
| Sign-in identifier | **email** (`UsernameAttributes=[email]`) |
| Self-sign-up | вимкнено (`AllowAdminCreateUserOnly=true`) |
| Створення користувачів | лише адміністратором |
| MFA | `OFF` |
| Password policy | live minimum **8 characters**; full complexity policy not re-audited in P4-07.7.5b |
| Password history | **not configured** (live) |
| Temporary password validity | **7 днів** (live) |
| Account recovery | verified email + verified phone (live) |
| User-existence errors | приховані (`PreventUserExistenceErrors: ENABLED`) |
| App Client | `structlab-dev-client` / `5abaa8u50uj7c4eii44goh2t2a`; no secret |
| Auth flows | `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_AUTH` |
| OAuth | code flow; domain `eu-north-15v0nxiluu`; callback `https://d84l1y8p4kdic.cloudfront.net` |
| Access token | 15 хвилин |
| ID token | 60 хвилин |
| Refresh token | 7 днів |
| Refresh-token rotation | `DISABLED` |
| Token revocation | увімкнено |
| Група | exact case-sensitive `teachers` |
| Deletion protection | `ACTIVE` |
| Stack outputs | not applicable; manual deployment has no CloudFormation outputs |

Live Cognito є авторитетним для frontend integration. CDK reference відрізняється:

| Setting | CDK reference | Live |
| --- | --- | --- |
| Ідентифікатор входу | Username, без email sign-in | Email (`UsernameAttributes=[email]`) |
| Minimum password length | 12 | 8 |
| Password history | 5 | Not configured |
| Temporary password validity | 3 days | 7 days |
| Account recovery | admin-only (`NONE`) | Verified email + verified phone |
| OAuth / domain | Not configured | Code flow + domain + CloudFront callback |
| Extra auth flow | `ALLOW_USER_AUTH` not configured | `ALLOW_USER_AUTH` enabled |
| User Pool removal policy | `RETAIN` | Not applicable (manual resource) |

Ці відмінності збережені навмисно; зміна потребує окремого схвалення. Не
застосовуйте CDK reference values до deployed client. The configured callback
`https://d84l1y8p4kdic.cloudfront.net` is Cognito Managed Login's existing
default redirect page, not the StructLab frontend; a successful Managed Login
screenshot does not prove frontend integration.

### Password history, temporary passwords і recovery (live vs CDK reference)

- У робочому User Pool історію паролів не налаштовано; тимчасовий пароль діє
  **7 днів**, відновлення доступу — через підтверджений email або номер
  телефону. Значення CDK (історія 5, тимчасовий пароль 3 дні, admin-only)
  до нього не застосовуються.
- Live minimum password length is **8**. The full complexity policy was not
  re-audited in P4-07.7.5b.
- MFA is `OFF`.
- `PreventUserExistenceErrors: ENABLED` зменшує розкриття інформації про
  наявність акаунта, але не є гарантією проти всіх технік enumeration.
- Administrative recovery API, frontend recovery UI, messaging infrastructure і
  automated account-management scripts не реалізовані. Frontend не повинен
  вигадувати recovery flow; координація — з авторизованим адміністратором.
- E2E-03 verified real Cognito authentication. Password change, password reset,
  temporary-password expiry, account recovery і user-enumeration behavior не
  тестувалися.

### Lifecycle: RETAIN, deletion protection і stack termination protection (CDK reference)

Цей підрозділ описує CDK reference. Live manual User Pool не належить
CloudFormation, тому `RETAIN` і stack deletion до нього не застосовуються; live
deletion protection — `ACTIVE`. Видалення live User Pool потребує окремого
схвалення.

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

### Авторизація в розгорнутому API

JWT authorizer налаштований на:

- issuer `https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_5v0nXILuU`;
- audience — `5abaa8u50uj7c4eii44goh2t2a` (ID публічного App Client);
- header `Authorization`.

Lambda приймає лише **access token** (`token_use === "access"`) і вимагає точну
групу `teachers`. ID token відхиляється з `401`, навіть якщо містить групу
`teachers`.

Cognito-акаунти студентів не створюються. Викладачів створює адміністратор
User Pool з email-адресою, після чого їх додають до групи `teachers`. Live
sign-in identifier — **email** (`UsernameAttributes=[email]`); під час SRP-логіну
frontend передає email як `Username`. Окремого username alias немає.

Live таблиця вище є авторитетною для deployed environment. Деталі policy — у
розділі «Дані, retention і recovery».

Докладніше про login-потік:
[`docs/frontend-integration.md`](docs/frontend-integration.md#2-автентифікація-викладача).

## Дані, retention і recovery (P4-03.1)

> **Межі P4-03.1.** Це документаційна policy для dev. Вона не змінює CDK, IAM,
> DynamoDB, Cognito або AWS-ресурси. P4-03.2–P4-03.5 реалізовано в CDK
> reference; live manual deployment має інші DynamoDB/Cognito значення. Live
> стан описаний у розділах «DynamoDB», «Cognito» і
> [`docs/manual-deployment.md`](docs/manual-deployment.md).

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

> **Live retained data.** E2E-10 safe cleanup is **DEFERRED BY OPERATOR**. Two
> synthetic students and one synthetic non-teacher remain in the deployed
> environment for frontend integration. The 30-day/end-of-testing policy still
> applies; deletion requires separate approval. Exact retained records and the
> cleanup runbook are in
> [`docs/manual-deployment.md`](docs/manual-deployment.md#10-deferred-cleanup-and-retained-test-data).

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
   profile `structlab-dev`, region `eu-north-1` і фактичну назву/ARN таблиці.
   Live manual table — `StructLabStudents-dev`; для CDK reference назву таблиці
   генерує CDK, тому її не можна вгадувати.
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

| Параметр | Live manual table | CDK reference |
| --- | --- | --- |
| `RemovalPolicy` | not applicable (manual resource) | `DESTROY` |
| Deletion protection | увімкнено | увімкнено |
| Capacity | 10 RCU / 10 WCU provisioned | on-demand 25 RRU/s / 25 WRU/s |
| Encryption | AWS-owned key | AWS managed key |
| PITR / AWS Backup / TTL | немає | немає (deferred) |

- Deletion protection захищає таблицю від `DeleteTable`, але **не є backup**:
  він не запобігає видаленню окремих items, перезапису, пошкодженню або
  логічним помилкам і не дає можливості відновити дані.
- Live manual table не належить CloudFormation, тому `cdk destroy` або rollback
  нею не керують. Для CDK reference `RemovalPolicy.DESTROY` разом із deletion
  protection може блокувати видалення stack або rollback, який вимагає
  видалення/заміни таблиці. Це очікуваний запобіжник, а не автоматичне
  відновлення.
- Live manual deployment завершено; сценарій failed initial CDK deploy
  залишається reference-інструкцією. Він може потребувати окремо схваленого
  ручного recovery. Не можна автоматично видаляти або перестворювати таблицю,
  щоб “обійти” помилку deployment.
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
- Live table has provisioned 10 RCU / 10 WCU; CDK reference uses on-demand
  25 RRU/s / 25 WRU/s. Neither is a hard spending cap or a guarantee of zero
  credit consumption.
- Cognito Essentials — затверджений tier. Попередня оцінка враховувала
  allowance для eligible direct authentication; право акаунта на нього та
  фактичні витрати у P4-07.7.5b не перевіряли.
- CDK reference P4-03.3–P4-03.5 не вмикають Plus, advanced security/threat
  protection, SMS/email MFA, managed login/Hosted UI, OAuth/domain, зовнішні
  identity providers, Lambda triggers, custom messaging, customer-managed KMS
  або SNS/SES. **Live manual pool** has OAuth code flow, a Cognito domain and
  Managed Login enabled; MFA remains `OFF`. This difference is preserved
  intentionally and requires separate approval to change.
- P4-03.1–P4-03.5 не додають PITR, AWS Backup, customer-managed KMS keys або
  іншу платну інфраструктуру.
- Paid Plan upgrade не передбачений.
- AWS Free Plan was last audited as `ACTIVE`; current plan, billing, credits and
  budget were not re-verified in P4-07.7.5b. Do not claim zero cost or unchanged
  credits.
- Документ не наводить цінових гарантій: фактичне споживання credits залежить
  від акаунта, регіону й майбутніх змін AWS.

### Прийняті обмеження P4-03.1–P4-03.5

- Retention policy не enforced автоматично; потрібне ручне очищення. E2E-10
  cleanup **DEFERRED BY OPERATOR**; два synthetic students і один synthetic
  non-teacher залишаються retained.
- Немає PITR, AWS Backup, DynamoDB TTL або автоматичного cleanup.
- Export/restore runbook не перевірений на deployed AWS resources; export і
  restore не виконувалися.
- Live DynamoDB deletion protection увімкнено; live throughput — provisioned
  10 RCU / 10 WCU. Це спостерігалося, але throughput/throttling під
  навантаженням не тестувалися.
- Live Cognito deletion protection — `ACTIVE`. `RETAIN` є CDK reference і до
  manual resource не застосовується. E2E-03 verified authentication; password
  reset, recovery і lifecycle operations не тестувалися.
- Cognito token TTL, revocation і refresh behavior налаштовані live; реальний
  token-refresh flow у frontend не перевірявся. Уже видані токени не
  скорочуються заднім числом, а API Gateway не перевіряє revocation для access
  token.
- Live password history **not configured**, temporary password **7 днів**,
  recovery через verified email + verified phone. Password change/reset,
  temporary-password expiry і user-enumeration behavior не тестувалися. CDK
  reference values (history 5, 3 дні, admin-only) не застосовуються.
- Робочі App Client і група `teachers` не належать CloudFormation.
  Політики видалення стека до них не застосовуються.
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

Заголовки відповіді: `content-type: application/json` і `cache-control: no-store`.

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
зберігається в DynamoDB. Реєстрація не є ідемпотентною: якщо результат `POST`
невідомий, не повторюйте запит автоматично — він може створити дублікат.

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
`Authorization: Bearer <access-token>` і точна група `teachers`.

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

Якщо `nextCursor` — рядок, передайте його без змін як `cursor`. Це не гарантує,
що наступна сторінка матиме записи. Завершуйте обхід лише за `nextCursor: null`;
порожня остання сторінка не скасовує вже отриманих результатів.

### Помилки авторизації

| Ситуація | Контракт API Gateway / Lambda |
| --- | --- |
| Відсутній, невалідний або прострочений JWT | `401` від API Gateway |
| ID token або інший `token_use` | `401` від Lambda: `{"error":"Unauthorized"}` |
| Access token без точної групи `teachers` | `403` від Lambda: `{"error":"Forbidden"}` |

Тіло `401` від API Gateway може відрізнятися від JSON-помилки Lambda.
У live-перевірках отримано `401` без токена, `200` із teacher access token,
`401` із teacher ID token і `403` із non-teacher access token. Збіг відповіді
з контрактом handler не доводить, який компонент її сформував
([результат E2E-06](docs/manual-deployment.md#93-authorization-behavior)).

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
- **Середовище зафіксовано (CDK reference).** `StructLabStack` явно pinned на account
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
- **Майбутній домен фронтенду.** Перед запуском з іншого origin перевірте
  фактичний CORS HTTP API. Якщо origin відсутній, потрібна окремо схвалена
  зміна allowlist саме цього API. Редагування `corsAllowedOrigins` у CDK не
  змінює вручну налаштований API; wildcard не використовується.
- **CORS для gateway-помилок.** Відповіді `401`/`403`/`429` і
  gateway-generated `500` від Lambda throttling можуть не містити
  CORS-заголовків, якщо їх генерує API Gateway, а не інтеграція. Це не було
  незалежно перевірено для gateway-generated відповідей; перевірте перед
  frontend release.
- **API Gateway throttling.** Default stage `$default` має
  `DefaultRouteSettings` з rate **10 req/s** і burst **20**. Перевищення
  очікувано повертає `429 Too Many Requests`, але live load behavior не
  перевірявся. Це best-effort обмеження на рівні stage, а не per-IP або
  per-user quota: один клієнт може вичерпати спільний burst. Воно не гарантує
  hard limit і не є spending cap. Lambda reserved concurrency не налаштований.
  Повторний `POST /students` після `429` може створити дублікат, бо idempotency
  не реалізована.
- **Lambda concurrency — спільний account pool.** Станом на P4-02.4
  `aws lambda get-account-settings` для `eu-north-1` (profile `structlab-dev`,
  AWS Free Plan) показує `ConcurrentExecutions: 10`,
  `UnreservedConcurrentExecutions: 10`, `FunctionCount: 0` і
  `TotalCodeSize: 0`. Це account-specific historical snapshot, а не постійний
  ліміт AWS Free Plan; квоту **не перевіряли повторно** в P4-07.7.5b. Усі три
  deployed Lambda-функції поділяють цей регіональний unreserved pool.
- **Reserved і provisioned concurrency свідомо не налаштовані.** P4-02.4 не
  додає reserved concurrency, provisioned concurrency, Lambda versions/aliases
  або запит на quota increase і не змінює конфігурацію Lambda. Reserved
  concurrency лише зменшує спільний pool, а provisioned concurrency є платною
  функцією; для dev достатньо best-effort API Gateway throttling.
- **Публічна реєстрація може вичерпати pool.** Сплеск `POST /students` здатен
  зайняти всі доступні unreserved executions, тому `GET /health` та admin-запити
  тимчасово теж можуть не виконуватися. API Gateway throttling (`10 req/s`,
  burst `20`) не гарантує concurrency isolation, per-IP fairness або hard
  spending cap.
- **Lambda throttling може давати `500`.** Якщо invocation відхилено через
  вичерпання concurrency, API Gateway може повернути gateway-generated `500`, а
  не `429`. Така відповідь може не містити CORS-заголовків. Фронтенд має
  обробляти її як тимчасову помилку й уникати агресивних retry, особливо для
  `POST /students`, де можливий дублікат.
- **Throttling і concurrency не перевірені під навантаженням.** Live
  configuration підтверджена, але реальні `429`, gateway-generated `500` від
  Lambda throttling, поведінка під навантаженням і CORS-заголовки цих відповідей
  потребують контрольованої перевірки з окремим схваленням.
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
- **CDK reference lifecycle.** User Pool має `RETAIN` і deletion protection.
  Після успішного видалення CDK stack pool може залишитися поза CloudFormation
  management, а users — у ньому; App Client і група `teachers` можуть бути
  видалені. Повторний CDK deploy не перевикористовує pool автоматично. Live
  manual resources не належать CloudFormation, тому `RETAIN`/stack deletion до
  них не застосовуються.
- **Live manual Cognito resources.** User Pool deletion protection — `ACTIVE`;
  App Client `structlab-dev-client` і група `teachers` існують. Жодного
  видалення не виконувалося. Вимкнення deletion protection саме по собі не
  видаляє pool або users, але дозволяє подальше авторизоване видалення.
- **DynamoDB захищена, але не є backup.** Live table має deletion protection;
  CDK reference додатково має `DESTROY`. Deletion protection не запобігає
  видаленню окремих items, перезапису або пошкодженню. Вимкнення захисту не
  видаляє дані саме по собі, але дозволяє подальше авторизоване видалення
  таблиці, яке знищить усі записи студентів.
- **Live E2E verification.** E2E-01–E2E-09 **PASS** (9/9): registration,
  DynamoDB persistence, real Cognito authentication, teacher access-token
  authorization, teacher ID-token rejection, non-teacher rejection, listing,
  pagination and input validation. E2E-10 cleanup **DEFERRED BY OPERATOR**.
  Deletion permissions/behavior, password reset/recovery, throttling load
  behavior and frontend integration remain unverified.
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
  змінювалися. Frontend integration **PENDING**; реальний frontend flow треба
  перевірити окремо.
- Після завершення refresh token користувачу може знадобитися повторний sign-in.
- Зменшення refresh token validity до 7 днів не гарантує заднім числом, що вже
  видані refresh tokens матимуть коротший строк; це стосується лише нових
  токенів, виданих після deployment нової конфігурації.
- Live App Client configuration спостерігалася, але реальна refresh/revocation
  behavior у Cognito і frontend не тестувалася.

### Account security та recovery (live vs CDK reference)

Для інтеграції застосовуйте [параметри робочого User Pool](#cognito).
E2E-03 підтвердив вхід; зміна та відновлення пароля, закінчення строку дії
тимчасового пароля і захист від розкриття наявності акаунта не тестувалися.

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
- `test` — **12 тестових файлів, 247 тестів пройшли** (historical accepted
  baseline; 28 infrastructure tests included; not rerun for P4-07.7.5b);
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
  (versions/aliases), відсутність OAuth/Hosted UI у CDK reference,
  `OPTIONS`-route та outputs. Live manual pool has OAuth enabled; the test covers
  only the CDK reference.

## Середовище dev

URL та ідентифікатори ресурсів наведено в [таблиці розгорнутого середовища](#розгорнуте-середовище-dev);
профіль оператора — `structlab-dev`. `lib/environments.ts` фіксує той самий
account/region для еталонного CDK-стека `StructLabBackendStack-dev`.
Його не розгортали. Для роботи з фактичними ресурсами див.
[manual deployment runbook](docs/manual-deployment.md), для локального CDK —
[deployment reference](docs/deployment.md).

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
| Потрібна зміна AWS-конфігурації | Manual deployment уже виконано; будь-яка infrastructure change потребує окремого схвалення. Див. [`docs/manual-deployment.md`](docs/manual-deployment.md). CDK deployment не використовувався. |

## Документація фаз

- [`docs/manual-deployment.md`](docs/manual-deployment.md) — фактичний manual AWS
  deployment: live resources, E2E evidence, authorization, contracts, retained
  data і cleanup runbook.
- [`docs/deployment.md`](docs/deployment.md) — CDK reference: dev target,
  environment safeguards, локальні перевірки, bootstrap/rollback. Він не
  відображає live manual deployment.
- [`docs/phase-2-plan.md`](docs/phase-2-plan.md) — історичний план Фази 2:
  DynamoDB, публічний `POST /students`, cursor-based пагінація та підготовка
  admin-обробника.
- [`docs/phase-3-plan.md`](docs/phase-3-plan.md) — історичний план Фази 3:
  Cognito, JWT authorizer, teacher guard, публічна реєстрація та security review.
  Поточна конфігурація описана в цьому README,
  `docs/manual-deployment.md` і `docs/frontend-integration.md`.
- [`docs/frontend-integration.md`](docs/frontend-integration.md) — точний
  контракт для фронтенду: live URL, email sign-in, access token, помилки,
  пагінація, CORS і throttling.

## Наступні кроки

1. **P4-08 — Final Review, Commit, Pull Request and Merge.** Потребує окремого
   схвалення; у P4-07.7.5b commit, push і merge не виконувалися. Manual AWS
   deployment уже завершено; функціональні live E2E — 9/9 PASS.
2. **Frontend integration (PENDING).** Використовувати live base URL, email
   sign-in, `UserPoolId` `eu-north-1_5v0nXILuU` і App Client
   `5abaa8u50uj7c4eii44goh2t2a`. Після перевірки фактичної CORS-конфігурації
   додати точний HTTPS-origin для deployed frontend окремо схваленим
   розгортанням.
3. **E2E-10 safe cleanup (DEFERRED BY OPERATOR).** Виконувати лише після
   окремого схвалення і лише для явно затверджених synthetic resources; не
   видаляти table, User Pool, App Client або групу `teachers` під час routine
   cleanup.
4. Додати per-IP rate limiting, WAF і CAPTCHA для публічної реєстрації.
5. Реалізувати перевірку особи студента та захист від дублікатів; registration
   не є idempotent.
6. Провести контрольовану перевірку throttling `429`, gateway-generated `500`
   від Lambda throttling і CORS-заголовків цих відповідей — лише з окремим
   схваленням.
7. Посилити production-конфігурацію: MFA, PITR, бекапи, моніторинг та аудит.
   Live Cognito values відрізняються від CDK reference; будь-яка зміна потребує
   окремого схвалення.
