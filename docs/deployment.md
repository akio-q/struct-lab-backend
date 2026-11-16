# Dev deployment: environment pinning and safeguards

**Статус:** P4-01 реалізовано локально. Жодного AWS API-виклику, `cdk bootstrap`,
`cdk diff`, `cdk deploy` або `cdk destroy` не виконувалося. AWS-ресурсів ще не
створено.

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

## 3. Локальні перевірки без AWS

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

## 4. Майбутні кроки деплою (не виконано в P4-01)

Наведені команди призначені для наступних задач Фази 4 після окремого
схвалення. P4-01 їх **не виконував**.

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

## 5. Відкат і видалення

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

## 6. Межі P4-01

P4-01 не додає CORS, throttling, WAF, budgets, alarms, PITR, deletion
protection, MFA або інші задачі Фази 4. Поточні API-маршрути, Lambda handlers,
DynamoDB schema і Cognito authorization behavior не змінювалися.
