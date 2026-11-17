# Dev deployment: environment pinning and safeguards

**Статус:** P4-01, P4-02.2 і P4-02.3 реалізовано локально. Жодного AWS
API-виклику, `cdk bootstrap`, `cdk diff`, `cdk deploy` або `cdk destroy` не
виконувалося. AWS-ресурсів ще не створено.

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
Відповіді `401`, `403` і `429`, які API Gateway генерує до виклику Lambda, можуть
не містити CORS-заголовків; це перевіряється після деплою.

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

## 5. Локальні перевірки без AWS

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

## 6. Майбутні кроки деплою (не виконано в P4-01, P4-02.2 або P4-02.3)

Наведені команди призначені для наступних задач Фази 4 після окремого
схвалення. P4-01, P4-02.2 і P4-02.3 їх **не виконували**.

1. Встановити/налаштувати AWS CLI v2 і profile `structlab-dev` з регіоном
   `eu-north-1`.
2. Перевірити особу та акаунт:

   ```bash
   aws sts get-caller-identity --profile structlab-dev
   aws configure get region --profile structlab-dev
   ```

   Очікуваний account — `677339799150`, регіон — `eu-north-1`.

3. Виконати bootstrap (P4-02, окреме схвалення):

   ```bash
   pnpm exec cdk bootstrap aws://677339799150/eu-north-1 --profile structlab-dev
   ```

4. Переглянути diff перед деплоєм (окреме схвалення):

   ```bash
   pnpm exec cdk diff --profile structlab-dev
   ```

5. Виконати деплой (окреме схвалення):

   ```bash
   pnpm exec cdk deploy --profile structlab-dev
   ```

6. Перевірити CORS preflight після деплою (окреме схвалення; тут не
   виконувалося):

   ```bash
   curl -i -X OPTIONS "<HttpApiUrl>/students" \
     -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: content-type"
   ```

   Очікувано: `204` і `access-control-allow-origin: http://localhost:3000`,
   `access-control-allow-methods` містить `POST`, `access-control-allow-headers`
   містить `content-type`, `access-control-max-age: 300`. Запит з origin поза
   allowlist не повинен отримувати `access-control-allow-origin`.

7. Перевірити gateway-generated помилки. `401`/`403` для `/admin/students` і
   `429` мають повертати CORS-заголовки для дозволеного origin. Якщо їх немає,
   браузер покаже мережеву помилку замість статусу; це потребує окремого
   рішення в наступних підзадачах.

8. Перевірити throttling під контрольованим навантаженням (окреме схвалення;
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

## 7. Відкат і видалення

- Невдале створення/оновлення CloudFormation зазвичай відкочується автоматично.
  Перевіряйте події стека в AWS Console або через CDK CLI.
- `cdk destroy` є операцією знищення даних. DynamoDB має
  `RemovalPolicy.DESTROY` і вимкнений deletion protection, тому всі записи
  студентів буде втрачено. Перед видаленням потрібен явний export/backup і
  ручне схвалення.
- Cognito User Pool має `RETAIN`; App Client і група `teachers` явного
  `RETAIN` не мають. Після видалення стека pool може залишитися, а повторний
  deploy створить нові Cognito-ресурси. Це треба враховувати під час cleanup.
- Не запускайте `cdk destroy` на середовищі, де є дані, без окремого
  runbook і схвалення.

## 8. Межі P4-01, P4-02.2 і P4-02.3

P4-01 не додає throttling, WAF, budgets, alarms, PITR, deletion protection, MFA
або інші задачі Фази 4. P4-02.2 додає native CORS для `http://localhost:3000`.
P4-02.3 додає best-effort throttling на default stage (`10 req/s`, burst `20`)
і не додає per-IP rate limiting, WAF, CAPTCHA, Lambda reserved concurrency або
CORS для задеплоєного HTTPS-домену. Поточні API-маршрути, Lambda handlers,
DynamoDB schema, Cognito authorization behavior та IAM не змінювалися.
