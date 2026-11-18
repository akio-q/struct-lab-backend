# Dev deployment: environment pinning and safeguards

**Статус:** P4-01 і P4-02 (P4-02.1–P4-02.4) реалізовано й перевірено локально;
P4-02.5 security review — PASS. P4-03.1 documentation-only policy для даних,
retention і recovery підготовлено локально; інфраструктурні зміни
P4-03.2–P4-03.5 ще
не реалізовані. У межах цих задач жодного AWS API-виклику, `cdk bootstrap`,
`cdk diff`, `cdk deploy` або `cdk destroy` не виконувалося; AWS-ресурсів ще не
створено. Quota snapshot у розділі 5 отриманий вручну поза цим workflow. Акаунт
залишається на AWS Free Plan; реальні грошові витрати не передбачені, платні
функції не вмикаються без окремого схвалення, але AWS credits можуть
витрачатися.

Цей документ описує зафіксоване dev-середовище, локальні перевірки та безпечні
кроки для майбутнього деплою. Він не є дозволом виконувати деплой: кожен
AWS-крок потребує окремого ручного схвалення.

## 1. Цільове середовище

| Параметр | Значення |
| --- | --- |
| AWS account | `677339799150` |
| AWS region | `eu-north-1` |
| AWS CLI profile | `structlab-dev` |
| AWS plan | AWS Free Plan |
| Environment | `dev` |
| CloudFormation stack name | `StructLabBackendStack-dev` |
| CDK construct ID | `StructLabBackendStack` |
| Джерело істини | `lib/environments.ts` |

`bin/app.ts` передає `DEV_ENVIRONMENT` у `StructLabStack`. Стек сам встановлює
`env`, `stackName` і теги; він не бере account/region з випадкових shell-змінних.

## 2. Механізми захисту

1. **Явний `env` у стеку.** `StructLabStack` завжди встановлює
   `{ account: '677339799150', region: 'eu-north-1' }`. Спроба передати інший
   `env` або інший `stackName` завершується помилкою до синтезу.
2. **Перевірка розв'язаного target.** `assertDeploymentTarget()` у `bin/app.ts`
   перевіряє `CDK_DEFAULT_ACCOUNT` і `CDK_DEFAULT_REGION` (з fallback на
   `AWS_REGION`/`AWS_DEFAULT_REGION`). Якщо CDK CLI розв'язав інший акаунт або
   регіон, синтез зупиняється з поясненням.
3. **Локальний synth без credentials.** Якщо `CDK_DEFAULT_ACCOUNT` не
   розв'язаний, перевірка не блокує `pnpm synth`: explicit `env` у стеку все одно
   фіксує цільовий акаунт і регіон.
4. **Перевірка після `super()`.** Стек додатково перевіряє, що фактичні
   `account`, `region` і `stackName` збігаються з конфігурацією.
5. **CDK CLI check.** Оскільки стек має explicit `env`, CDK CLI відмовляється
   деплоїти його в інший акаунт/регіон, ніж зазначено в стеку.
6. **Теги ресурсів.** До всіх тегованих ресурсів застосовуються:

| Key | Value |
| --- | --- |
| `Project` | `StructLab` |
| `Service` | `struct-lab-backend` |
| `Environment` | `dev` |
| `ManagedBy` | `AWS CDK` |

7. **Секрети.** У репозиторії немає access keys, паролів або тимчасових
   credentials. Для деплою використовуйте AWS CLI profile `structlab-dev` або
   SSO; не додавайте ключі у файли проєкту.
8. **CORS allowlist.** `bin/app.ts` викликає `assertValidCorsOrigins()` до
   синтезу. Список origin зберігається в `DEV_ENVIRONMENT.corsAllowedOrigins`;
   wildcards та неканонічні origins відхиляються. Деталі — в розділі 3.
9. **Throttling.** `bin/app.ts` викликає `assertValidThrottling()` до синтезу.
   Значення зберігаються в `DEV_ENVIRONMENT.throttling`; невалідні rate/burst
   відхиляються. Деталі — в розділі 4.
10. **Concurrency decision.** P4-02.4 не додає reserved або provisioned
    concurrency, Lambda versions/aliases чи quota increase і не змінює
    конфігурацію Lambda. Деталі та quota snapshot — в розділі 5.
11. **Request hardening.** `POST /students` приймає лише
    `Content-Type: application/json` (з опційним `charset=utf-8`) і не більше
    **4096 decoded bytes**. Перевірки виконуються до JSON parsing і запису в
    DynamoDB; некоректний `Content-Type` повертає `415`, перевищення ліміту —
    `413`. Це application-level захист, не edge-level, не WAF і не заміна
    per-IP rate limiting. Деталі — в розділі 2.1.

### 2.1. Request hardening для `POST /students`

- Обов'язковий `Content-Type: application/json`; допускається параметр
  `charset=utf-8`. Регістр назви заголовка й media type не має значення.
- Максимальний розмір тіла — **4096 decoded bytes**. Для UTF-8 рахуються байти,
  а не довжина JavaScript-рядка; base64-тіло спершу декодується.
- Перевірки виконуються в порядку: `Content-Type` → розмір тіла → JSON parsing →
  валідація полів → запис у DynamoDB.
- Відсутній або некоректний `Content-Type` → `415`; перевищення ліміту → `413`.
- Відхилені запити не створюють записів у DynamoDB.
- Це **application-level** обмеження. API Gateway усе одно приймає більші payload
  до platform limits; це не edge-level захист, не WAF і не anti-spam механізм.

## 3. CORS

CORS налаштований нативно на API Gateway HTTP API (`corsPreflight` у
`lib/struct-lab-stack.ts`). Окремого `OPTIONS`-маршруту та Lambda-заголовків
немає: preflight обробляє API Gateway.

| Параметр | Значення |
| --- | --- |
| Дозволені origins | `http://localhost:3000` |
| Дозволені методи | `GET`, `POST` |
| Дозволені headers | `content-type`, `authorization` |
| `AllowCredentials` | `false` |
| `MaxAge` | `300` секунд |
| Wildcards | заборонені |

Джерело істини — `DEV_ENVIRONMENT.corsAllowedOrigins` у `lib/environments.ts`.
Валідатор відхиляє порожній список, дублікати, wildcards, trailing slashes,
paths, query strings, fragments, credentials, не-HTTP(S) схеми, HTTP поза
`localhost` і неканонічні origins (наприклад, uppercase host або default port).
Повідомлення про помилки не містять значення origin, щоб випадково не
розкрити embedded credentials.

Next.js локально працює на `http://localhost:3000`, тому dev-proxy не потрібен.
Браузер сам виконує preflight для `POST /students` і для `GET /admin/students` із
`Authorization`. Access token передається як `Authorization: Bearer ...`;
cross-origin cookies не використовуються (`AllowCredentials: false`).

Майбутній HTTPS-origin фронтенду додається точним рядком у
`corsAllowedOrigins`, наприклад `https://struct-lab.example.com`. Після зміни
потрібні нові локальні перевірки та окремо схвалений деплой; wildcard
використовувати не можна.

CORS не є автентифікацією, rate limiting, WAF або anti-spam захистом.
`GET /admin/students` усе одно вимагає Cognito access token і групу `teachers`.
Відповіді `401`, `403`, `429` і gateway-generated `500` від Lambda throttling
можуть не містити CORS-заголовків, якщо їх генерує API Gateway, а не інтеграція;
це перевіряється після деплою.

## 4. Throttling

Throttling застосований до існуючого default stage `$default` через
`DefaultRouteSettings`. Stage не перестворюється: використовується L1 escape
hatch (`CfnStage`), тому construct identity і CloudFormation logical ID
зберігаються.

| Параметр | Значення |
| --- | --- |
| Rate limit | `10` requests per second |
| Burst limit | `20` |
| Stage | `$default` |
| `AutoDeploy` | `true` |
| Route-specific overrides | немає |
| Перевищення | `429 Too Many Requests` |

Джерело істини — `DEV_ENVIRONMENT.throttling` у `lib/environments.ts`.
`bin/app.ts` викликає `assertValidThrottling()` до синтезу: rate має бути
positive finite number, burst — positive integer.

Це best-effort обмеження на рівні stage, а не per-IP або per-user quota. Усі
клієнти поділяють один ліміт, тому один клієнт може вичерпати burst для інших.
Throttling не є гарантованим hard limit, WAF або spending cap. Lambda reserved
concurrency не налаштований. Повторний `POST /students` після `429` може
створити дублікат, бо idempotency не реалізована.

## 5. Lambda concurrency і quota awareness

### 5.1. Фактичні account quotas

Спостережено вручну через `aws lambda get-account-settings` (profile
`structlab-dev`, region `eu-north-1`, AWS Free Plan):

| Параметр | Значення |
| --- | --- |
| `ConcurrentExecutions` | `10` |
| `UnreservedConcurrentExecutions` | `10` |
| `FunctionCount` | `0` |
| `TotalCodeSize` | `0` |

Це account-specific snapshot на момент P4-02.4, а не постійний ліміт AWS Free
Plan. AWS може змінити квоту; перед деплоєм її треба перевірити знову.

### 5.2. Рішення

- Reserved concurrency не налаштовується.
- Provisioned concurrency не налаштовується.
- Quota increase не запитується.
- Існуюча конфігурація Lambda не змінюється.
- API Gateway throttling залишається `10 req/s`, burst `20`.
- Акаунт залишається на AWS Free Plan.

Reserved concurrency лише зменшує спільний unreserved pool і не створює
додаткової ізоляції між клієнтами; provisioned concurrency є платною функцією.
Для dev достатньо best-effort API Gateway throttling, тому інфраструктура в
P4-02.4 не змінювалася.

### 5.3. Спільний pool і наслідки

Усі три Lambda-функції (`GET /health`, `POST /students`,
`GET /admin/students`) використовують один регіональний unreserved pool.
Сплеск публічних `POST /students` може вичерпати всі 10 executions; тоді інші
маршрути тимчасово не виконуватимуться.

API Gateway throttling обмежує швидкість запитів на stage, але не гарантує
concurrency isolation, per-IP fairness або hard spending cap. Якщо Lambda
відхиляє invocation через throttling, API Gateway може повернути
gateway-generated `500` замість `429`. Така відповідь може не містити
CORS-заголовків, тому браузер може показати мережеву помилку.

Повторний `POST /students` після `500`, `429` або таймауту може створити
дублікат: idempotency не реалізована. Фронтенд має уникати агресивних retry і
повторювати `POST` лише після підтвердження користувача.

### 5.4. Перевірка перед деплоєм

```bash
aws lambda get-account-settings \
  --profile structlab-dev \
  --region eu-north-1
```

Зафіксуйте `ConcurrentExecutions` і `UnreservedConcurrentExecutions`. Якщо вони
відрізняються від snapshot, оновіть документацію і перегляньте ризик
вичерпання pool. Не запитуйте quota increase без окремого схвалення.

### 5.5. Контрольована post-deploy перевірка

Після окремо схваленого деплою в dev:

- переконатися, що звичайні запити до всіх трьох маршрутів працюють;
- під контрольованим навантаженням перевірити поведінку при вичерпанні
  concurrency (паралельні запити до `/health` і `POST /students`);
- зафіксувати фактичні статуси: `429` від API Gateway throttling і/або `500`
  від Lambda throttling;
- перевірити CORS-заголовки на цих відповідях;
- не спрямовувати тест на production і не перевищувати dev-квоту.

Тут ця перевірка **не виконувалася**.

## 6. Локальні перевірки без AWS

Виконуйте з кореня репозиторію:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm synth
```

Точна безпечна команда для synth:

```bash
pnpm synth
```

Вона не потребує AWS-ключів, не створює ресурсів і не робить AWS API-викликів.
Очікуваний результат:

- `cdk.out/StructLabBackendStack.template.json`;
- `CorsConfiguration` у `AWS::ApiGatewayV2::Api` з origin
  `http://localhost:3000`, методами `GET`/`POST`, headers
  `content-type`/`authorization`, `AllowCredentials: false`, `MaxAge: 300`;
- `AWS::ApiGatewayV2::Stage` (`$default`, `AutoDeploy: true`, незмінний logical
  ID) з `DefaultRouteSettings`: `ThrottlingRateLimit: 10`,
  `ThrottlingBurstLimit: 20`;
- відсутність `ReservedConcurrentExecutions` у всіх `AWS::Lambda::Function`;
- відсутність `AWS::Lambda::Version` і `AWS::Lambda::Alias` (provisioned
  concurrency не налаштована);
- попередження CDK про `RemovalPolicy.DESTROY` для DynamoDB (очікувано для
  навчального середовища);
- повідомлення про незадані feature flags (інформаційне).

Перевірити назву стека без деплою:

```bash
pnpm exec cdk ls
```

Очікуваний рядок:

```text
StructLabBackendStack (StructLabBackendStack-dev)
```

Якщо у shell залишилися змінні від іншого AWS-середовища, app навмисно
зупиниться. Для чистого локального synth у PowerShell:

```powershell
Remove-Item Env:CDK_DEFAULT_ACCOUNT -ErrorAction SilentlyContinue
Remove-Item Env:CDK_DEFAULT_REGION -ErrorAction SilentlyContinue
Remove-Item Env:AWS_REGION -ErrorAction SilentlyContinue
Remove-Item Env:AWS_DEFAULT_REGION -ErrorAction SilentlyContinue
pnpm synth
```

Не вимикайте перевірку в коді, щоб обійти це обмеження.

## 7. Майбутні кроки деплою (не виконано в P4-01 і P4-02)

Наведені команди призначені для наступних задач Фази 4 після окремого
схвалення. P4-01 і P4-02 їх **не виконували**; P4-03 — наступна запланована
задача.

1. Встановити/налаштувати AWS CLI v2 і profile `structlab-dev` з регіоном
   `eu-north-1`.
2. Перевірити особу та акаунт:

   ```bash
   aws sts get-caller-identity --profile structlab-dev
   aws configure get region --profile structlab-dev
   ```

   Очікуваний account — `677339799150`, регіон — `eu-north-1`.

3. Повторно перевірити Lambda account quotas (розділ 5.4):

   ```bash
   aws lambda get-account-settings \
     --profile structlab-dev \
     --region eu-north-1
   ```

   Не запитувати quota increase без окремого схвалення. Якщо значення
   відрізняються від snapshot, оновити документацію перед деплоєм.

4. Виконати bootstrap (окреме схвалення):

   ```bash
   pnpm exec cdk bootstrap aws://677339799150/eu-north-1 --profile structlab-dev
   ```

5. Переглянути diff перед деплоєм (окреме схвалення):

   ```bash
   pnpm exec cdk diff --profile structlab-dev
   ```

6. Виконати деплой (окреме схвалення):

   ```bash
   pnpm exec cdk deploy --profile structlab-dev
   ```

7. Перевірити CORS preflight після деплою (окреме схвалення; тут не
   виконувалося):

   ```bash
   curl -i -X OPTIONS "<HttpApiUrl>/students" \
     -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type"
   ```

   Очікувано: успішний 2xx із заголовком
   `access-control-allow-origin: http://localhost:3000`,
   `access-control-allow-methods` містить `POST`,
   `access-control-allow-headers` містить `content-type`,
   `access-control-max-age: 300`. Фактичний статус (зазвичай `204`) зафіксувати
   під час post-deploy перевірки. Запит з origin поза allowlist не повинен
   отримувати `access-control-allow-origin`.

8. Перевірити gateway-generated помилки. `401`/`403` для `/admin/students`,
   `429` від API Gateway throttling і `500` від Lambda throttling мають
   повертати CORS-заголовки для дозволеного origin. Якщо їх немає, браузер
   покаже мережеву помилку замість статусу; це потребує окремого рішення в
   наступних підзадачах.

9. Перевірити throttling під контрольованим навантаженням (окреме схвалення;
   тут не виконувалося):

   ```bash
   for i in $(seq 1 50); do
     curl -s -o /dev/null -w "%{http_code}\n" "<HttpApiUrl>/health"
   done | sort | uniq -c
   ```

   Очікувано: частина запитів отримує `429 Too Many Requests` після
   вичерпання burst 20. Результат best-effort: точна кількість `429` залежить
   від таймінгу та account-level limits. Перевірку виконувати лише в dev і не
   спрямовувати на production.

10. Перевірити вичерпання Lambda concurrency (окреме схвалення; тут не
    виконувалося). Використати контрольовану кількість паралельних запитів до
    `/health` і `POST /students`, не перевищуючи dev-квоту, та зафіксувати
    фактичні статуси. Очікувано: або `429` від API Gateway throttling, або
    gateway-generated `500` від Lambda throttling; обидва варіанти є
    best-effort. Перевірити CORS-заголовки і не спрямовувати тест на
    production.

## 8. Відкат і видалення

- Невдале створення/оновлення CloudFormation зазвичай відкочується автоматично.
  Перевіряйте події стека в AWS Console або через CDK CLI.
- `cdk destroy` є операцією знищення даних. Поточний стек (P4-03.1) має
  `RemovalPolicy.DESTROY` і вимкнений deletion protection, тому всі записи
  студентів буде втрачено. P4-03.2 має увімкнути deletion protection, не
  змінюючи `DESTROY`; доки це не реалізовано, чинним є поточний стан. Перед
  видаленням потрібен явний export/backup і ручне схвалення. Детальний
  runbook — у розділі 13.
- Cognito User Pool має `RETAIN`; App Client і група `teachers` явного
  `RETAIN` не мають. Після видалення стека pool може залишитися, а повторний
  deploy створить нові Cognito-ресурси. Це треба враховувати під час cleanup.
- Не запускайте `cdk destroy` на середовищі, де є дані, без окремого
  runbook і схвалення.

## 9. Межі P4-01, P4-02 і P4-03.1

P4-01 не додає throttling, WAF, budgets, alarms, PITR, deletion protection, MFA
або інші задачі Фази 4. P4-02.1 додає application-level request hardening для
`POST /students` (`Content-Type: application/json`, 4096 decoded bytes,
`413`/`415`); це не edge-level захист. P4-02.2 додає native CORS для
`http://localhost:3000`. P4-02.3 додає best-effort throttling на default stage
(`10 req/s`, burst `20`). P4-02.4 додає лише документацію та regression-тест:
reserved і provisioned concurrency не налаштовані, quota increase не
запитується, Lambda configuration не змінюється. Жодна з цих задач не додає
per-IP rate limiting, WAF, CAPTCHA або CORS для задеплоєного HTTPS-домену.
Поточні API-маршрути, Lambda handlers, DynamoDB schema, Cognito authorization
behavior та IAM не змінювалися.

P4-03.1 є documentation-only: він не змінює application code, CDK, IAM,
DynamoDB, Cognito, tests, dependencies або lockfiles; не створює AWS-ресурсів і
не виконує AWS API/CLI-викликів. Усі майбутні зміни P4-03.2–P4-03.5 потребують
окремого схвалення.

## 10. Data governance (P4-03.1)

Цей розділ фіксує policy для dev-даних. Він не є технічним контролем і не
змінює поточну конфігурацію стека.

### 10.1. Фактичні поля та класифікація

За `src/students/types.ts` і `src/handlers/create-student.ts` таблиця студентів
містить лише чотири поля:

| Поле | Формат | Класифікація |
| --- | --- | --- |
| `studentId` | UUID v4, генерується сервером | Псевдонімний ідентифікатор; пов'язує записи, але сам по собі не ідентифікує людину |
| `fullName` | Рядок, 1–200 символів після `trim()` | Персональні дані; пряма ідентифікація |
| `group` | Рядок, 1–50 символів після `trim()` | Потенційний непрямий ідентифікатор у поєднанні з ПІБ |
| `createdAt` | ISO 8601 | Метадані; квазі-ідентифікатор у поєднанні з іншими полями |

`studentId` не є публічним ідентифікатором, але він зв'язує записи в межах
таблиці. `group` разом із `fullName` може звузити коло осіб, тому
розглядається як потенційний непрямий ідентифікатор. `createdAt` сам по собі
не ідентифікує людину, але в поєднанні з іншими полями може бути
квазі-ідентифікатором.

### 10.2. Synthetic-only policy

- Dev призначений **лише для синтетичних даних**. Синтетичні імена, групи та
  request payloads **можуть** з'являтися в документації та test fixtures;
  приклади `Іван Петренко` і `ІП-21` — вигадані.
- Реальні імена, контактні дані, адреси, ідентифікатори студентів або інші
  персональні дані вносити заборонено.
- Реальні credentials, passwords, tokens і AWS credentials заборонені в
  документації, fixtures, запитах і експортах.
- Заборонено додавати чутливі дані (стан здоров'я, фінанси, оцінки тощо) без
  окремого privacy/security review.
- Публічний `POST /students` не може технічно enforce synthetic-only policy:
  endpoint приймає будь-який валідний payload. Дотримання policy залежить від
  процесу, review і дисципліни maintainer-ів.
- Dev **не схвалений** для обробки реальних персональних даних студентів.

### 10.3. Логи, Git та інші канали

- Дані студента й тіло запиту не повинні потрапляти в application logs,
  **навіть якщо значення синтетичні**. Для помилок логується лише назва класу
  помилки; logging student data і request bodies заборонено.
- Реальні ПІБ, контактні дані, ідентифікатори студентів та інші персональні
  дані не повинні з'являтися в Git commits, test fixtures, screenshots або
  shared reports. Синтетичні тестові значення в документації та fixtures
  дозволені.
- Credentials, passwords, tokens і AWS credentials не повинні з'являтися в
  student registration payloads, logs, Git, документації, fixtures,
  screenshots, reports або exports.
- Легітимна автентифікація через Cognito, авторизовані AWS CLI sessions і
  Bearer access token у заголовку `Authorization` дозволені; authentication
  behavior не змінюється.
- Перед публікацією screenshots або звітів перевірте, що в них немає реальних
  даних, токенів, cookie, AWS account identifiers або інших секретів.

## 11. Retention policy (P4-03.1)

### 11.1. Правило

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
- Очищення виконує вповноважений maintainer вручну.
- Maintainer вручну перевіряє, що прострочені або завершені тестові записи
  відсутні.
- Зовнішні експорти мають той самий максимальний строк — 30 днів або до
  завершення тестування. Після цього експорт і ключ доступу безпечно
  видаляються.
- Повторний export не скидає 30-денний строк: він рахується від `createdAt`
  оригінального запису, а не від дати нового export.
- Restore не змінює оригінальний `createdAt` і не продовжує retention.
- Export retention не може продовжувати retention оригінальних записів;
  записи, які досягли або перевищили свій retention deadline, не
  відновлюються.

### 11.2. Ручна процедура очищення

1. Під час щоденного review визначити записи, які досягли 30 днів з моменту
   створення, і записи, чиє відповідне тестування завершено.
2. Переконатися, що для кожного запису спрацював хоча б один із двох тригерів:
   30-денний строк або завершення тестування. Активне тестування не є підставою
   залишити запис після 30 днів.
3. Зафіксувати точний deletion deadline для кожного запису й експорту та
   отримати окреме схвалення на AWS-операцію до його настання.
4. Видалити записи через схвалену operator-процедуру. Окремого delete API або
   автоматизованого скрипта в репозиторії немає.
5. Повторно перевірити, що прострочені та завершені тестові записи відсутні.
6. Зафіксувати факт очищення без ПІБ, токенів або інших персональних даних.

### 11.3. Policy versus technical control

Це **операційна policy**, а не автоматично забезпечений контроль. DynamoDB не
видаляє записи автоматично. У P4-03.1 немає DynamoDB TTL, scheduled Lambda,
AWS Backup lifecycle або іншої інфраструктури cleanup. Дотримання строку
залежить від ручної процедури та дисципліни maintainer-ів.

DynamoDB TTL, якщо його буде додано пізніше, є eventual-deletion механізмом і
не замінює негайне видалення на вимогу. Додавання TTL потребує окремого
схвалення, зміни schema/handler-ів і тестів.

## 12. Export і recovery runbook (майбутня процедура)

Цей runbook описує майбутні окремо схвачені операції. У P4-03.1 він **не
виконувався** і не перевірявся на задеплоєних AWS-ресурсах. Скрипти, додаткові
AWS-ресурси, нові IAM-права або S3 bucket не створюються.

### 12.1. Preflight

1. Перевірити identity та регіон:

   ```bash
   aws sts get-caller-identity --profile structlab-dev
   aws configure get region --profile structlab-dev
   ```

   Очікуваний account — `677339799150`, регіон — `eu-north-1`. Якщо хоч одне
   значення відрізняється, зупинитися.

2. Перевірити stack і таблицю. Назву таблиці генерує CDK, тому її не можна
   вгадувати. Використати AWS Console або окремо схвалений read-only CLI-запит
   до `StructLabBackendStack-dev`; зафіксувати table name, ARN і region.
   Перевірити, що ARN належить цільовому account/region, а table name
   відповідає логічному ресурсу `StudentsTable` у стеку (через logical
   resource ID, tags або stack resources).

3. Зафіксувати письмове схвалення: environment, stack, table, operator, обсяг
   експорту, місце зберігання, власник ключа шифрування і дата видалення.
   Окреме схвалення потрібне для export, restore і будь-якої destructive
   operation.

### 12.2. Пауза записів

- Для узгодженого експорту зупинити тестові клієнти та скоординувати freeze
  записів.
- Публічний `POST /students` не має maintenance mode або write-lock. Навіть
  після зупинки клієнтів зовнішній клієнт може продовжити запис.
- `Scan` не є snapshot і не гарантує isolation під час конкурентних записів.
  Якщо потрібна сувора узгодженість, потрібен окремий механізм, який у
  P4-03.1 не створюється.

### 12.3. Paginated Scan export

- Читати таблицю сторінками через `Scan` з `Limit` і
  `ExclusiveStartKey`/`LastEvaluatedKey`.
- Продовжувати, доки `LastEvaluatedKey` не стане відсутнім.
- Використовувати DynamoDB JSON із типами (`S`, `N`, `BOOL`, `NULL`, `M`, `L`
  тощо). Не перетворювати item на довільний plain JSON і не втрачати типи.
- Зберігати `studentId` без змін; не генерувати нові UUID.
- `ConsistentRead` можна використовувати для окремих сторінок, але він не
  створює snapshot між сторінками і може збільшити споживання read capacity.
- Не використовувати `ProjectionExpression`, який приховує потрібні поля, і не
  змішувати різні набори полів між сторінками.

### 12.4. Перевірка повноти та цілісності

- Порахувати items у всіх сторінках і перевірити відсутність дублікатів
  `studentId`.
- Перевірити наявність і типи чотирьох полів, формат UUID v4 і валідність
  `createdAt`.
- Порівняти кількість із контрольним підрахунком або тестовим restore.
  Контрольний підрахунок теж може бути неузгодженим, якщо під час нього є
  записи.
- Обчислити checksum архіву; зберігати його окремо від даних, щоб перевіряти
  цілісність під час restore.
- За можливості виконати тестовий restore у порожню staging-таблицю та
  порівняти вибірку або всі записи.

### 12.5. Шифрування та зберігання

- Зашифрувати експорт at rest **до** збереження у постійному місці. Ключ
  зберігати окремо від даних і з іншим набором доступу.
- Зберігати експорт поза Git-репозиторієм і поза AWS-акаунтом.
- Доступ — лише для вповноважених maintainer-ів; не надсилати експорт у chat,
  email, публічні сховища або shared directories.
- Позначити експорт датою створення, датою видалення і власником. Не додавати
  ПІБ у назву файлу або metadata.
- Максимальний строк зберігання експорту — 30 днів або до завершення
  тестування, якщо раніше.
- Повторний export не скидає 30-денний строк: він рахується від `createdAt`
  оригінального запису.
- Якщо експорт містить кілька записів, застосовується найраніший відповідний
  deletion deadline.
- Export retention не може продовжувати retention оригінальних записів;
  записи, які досягли або перевищили свій retention deadline, не включаються в
  експорт для restore.

### 12.6. Restore

1. Перевірити account, region, stack і target table. За замовчуванням
   відновлювати лише в перевірену **порожню** таблицю в тому самому
   account/region. Не відновлювати в production, активну dev-таблицю або
   non-empty таблицю без окремого схвалення.
2. За можливості зупинити інші записи в target-таблицю на час restore.
3. Перед restore перевірити checksum експорту.
4. Не відновлювати записи, які досягли або перевищили свій retention deadline
   (30 днів від `createdAt` або завершення тестування). Restore не змінює
   `createdAt` і не продовжує retention.
5. `PutItem` і `BatchWriteItem` можуть перезаписати наявні записи. Якщо
   потрібно запобігти overwrite, використовувати conditional `PutItem` з
   `attribute_not_exists(studentId)`.
6. `BatchWriteItem` не підтримує per-item condition expressions.
7. Відновлення в non-empty таблицю потребує окремого схвалення та
   collision-handling strategy: визначити, які записи перезаписуються, які
   пропускаються і як перевіряється результат.
8. Для `BatchWriteItem` перевіряти `UnprocessedItems` і застосовувати bounded
   retries with backoff. Якщо failures persist — зупинити restore і повідомити
   про частковий стан; не приховувати помилку нескінченними повторами.
9. Після restore порахувати записи, перевірити ключі, поля, типи й вибірку
   значень; переконатися, що зайвих або втрачених items немає.
10. Не перестворювати таблицю автоматично; проблеми restore вирішуються
    окремо схваленим ручним recovery.

### 12.7. Очищення

- Видалити тимчасові plaintext-файли одразу після завершення export/restore.
- Після 30 днів або завершення тестування безпечно видалити експорт і ключ
  доступу; перевірити, що копій не залишилося.
- Зафіксувати дату, оператора й факт видалення без ПІБ і секретів.

### 12.8. Обмеження

- `Scan` **не є point-in-time backup** і не забезпечує snapshot isolation.
  Під час конкурентних записів сторінки можуть містити неузгоджені, повторні
  або пропущені items.
- Runbook не замінює PITR, AWS Backup або transaction-level consistency.
- Процедура не перевірена на задеплоєних AWS-ресурсах; це accepted limitation
  P4-03.1.

### 12.9. Recovery scenarios

- **Normal recovery within the current approved AWS development account.**
  Використовувати зовнішній export і restore у перевірену порожню або схвалену
  таблицю в account `677339799150`, region `eu-north-1`, після окремого
  схвалення. Це основний сценарій цього runbook.
- **Recovery after Free Plan expiration or loss of access to the original
  account.** In-account ресурси, зокрема DynamoDB і Cognito, можуть бути
  недоступними; PITR/backups у акаунті не є recovery strategy. Відновлення може
  потребувати окремо схваленого replacement dev environment. Цей документ
  **не дає дозволу** на deployment в інший AWS account або на Paid Plan upgrade.
- External export preserves student records, але не повний AWS environment: він
  не містить Cognito users, app client, групу `teachers`, IAM, API Gateway,
  Lambda, CloudFormation/CDK state або інші ресурси. Викладачів, клієнт, групу
  й інфраструктуру треба створювати заново за окремо схваленим runbook.

## 13. Accidental deletion, rollback і deletion protection

### 13.1. Поточний і затверджений стан

| Параметр | P4-03.1 (поточний стек) | Затверджено для P4-03.2 |
| --- | --- | --- |
| `RemovalPolicy` | `DESTROY` | `DESTROY` |
| Deletion protection | вимкнено | увімкнено |
| Max on-demand read | не задано | 25 RRU/s |
| Max on-demand write | не задано | 25 WRU/s |
| Encryption | AWS managed key | без змін |
| PITR / AWS Backup / TTL | немає | deferred |

Ці значення є **цільовими**. P4-03.1 не реалізує deletion protection або
throughput caps і не змінює CDK-стек. До виконання P4-03.2 чинною є ліва
колонка.

### 13.2. Що робить і чого не робить deletion protection

- Захищає таблицю від `DeleteTable` через console, CLI або CloudFormation.
- **Не є backup**: не запобігає `DeleteItem`, `UpdateItem`, перезапису через
  `PutItem`, логічним помилкам або пошкодженню даних.
- Не дає point-in-time recovery і не зберігає копію даних після вимкнення
  захисту та видалення таблиці.
- Не захищає від втрати доступу до AWS-акаунта.

### 13.3. Stack deletion і rollback

- Із `RemovalPolicy.DESTROY` CloudFormation намагається викликати `DeleteTable`.
  Якщо deletion protection увімкнений, видалення stack може завершитися
  помилкою, доки захист не вимкнено.
- Rollback, який вимагає видалення або заміни таблиці, також може бути
  заблокований deletion protection.
- Це очікуваний запобіжник. Не вимикайте захист автоматично і не додавайте
  обхідні шляхи в CDK.
- Вимкнення deletion protection потребує окремого схвалення. Після вимкнення
  захист більше не діє.
- Невдалий початковий deploy може залишити stack у failed state і потребувати
  окремо схваленого ручного recovery.
- Ніколи не видаляйте і не перестворюйте таблицю автоматично, щоб “обійти”
  помилку deployment або rollback.

### 13.4. Порядок destructive operation

1. Зробити export і перевірити його повноту.
2. Переконатися, що export зашифрований і зберігається поза акаунтом.
3. Отримати окреме схвалення на destructive operation.
4. Лише після цього вимикати deletion protection або запускати `cdk destroy`.
5. Після операції перевірити фактичний стан ресурсів і зафіксувати результат.

## 14. AWS Free Plan і cost constraints

- Dev-середовище тимчасове й призначене лише для розробки.
- Закінчення AWS Free Plan або вичерпання credits може обмежити доступ до
  ресурсів акаунта.
- In-account ресурси, зокрема DynamoDB і Cognito, **не є постійною стратегією
  recovery**: після втрати доступу до акаунта вони можуть стати недоступними.
- Сценарії normal recovery і recovery після втрати доступу розділені в
  розділі 12.9. Replacement environment потребує окремого схвалення; документ
  не дає дозволу на deployment в інший акаунт або Paid Plan upgrade.
- Потрібні export-и треба створювати до втрати доступу.
- DynamoDB storage, reads і writes, а також ручні export/restore можуть
  витрачати AWS credits.
- P4-03.1 не додає PITR, AWS Backup, customer-managed KMS keys, WAF, budgets
  або іншу платну інфраструктуру.
- Paid Plan upgrade не передбачений.
- AWS credits не є необмеженим безкоштовним використанням. Водночас документ не
  наводить цінових гарантій: фактичне споживання залежить від акаунта, регіону,
  обсягу даних і майбутніх змін AWS.
- Мета «нуль реальних грошових витрат» є проєктним обмеженням, а не гарантією
  відсутності будь-якого списання credits.

## 15. Future production requirements (out of scope)

Наступні теми не входять у P4-03.1 і потребують окремого проєктування,
privacy/security review і схвалення:

- обробка реальних персональних даних студентів;
- production retention та erasure policy;
- production backup і disaster recovery;
- production removal/replacement policy;
- формальний access auditing;
- сильніша автентифікація викладачів і MFA;
- повний production privacy/security review.

Поточний dev-стек не можна використовувати як production-середовище для
реальних студентських даних.
