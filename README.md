# StructLab Backend

Бекенд навчального вебзастосунку **StructLab** — тренажера структур даних.

Це **Фаза 1**: базова інфраструктура на AWS CDK, одна Lambda-функція та публічний
endpoint `GET /health`. База даних, авторизація та робота зі студентами з'являться
в наступних фазах.

## Що вже зроблено

- TypeScript-проєкт у strict mode.
- AWS CDK v2 stack, який описує:
  - API Gateway HTTP API;
  - Lambda-функцію на Node.js 22;
  - маршрут `GET /health`.
- Обробник `GET /health`, який повертає:

  ```json
  {
    "status": "ok",
    "service": "struct-lab-backend"
  }
  ```

- Unit-тест для Lambda-обробника.
- Тест CDK stack, який перевіряє Lambda, HTTP API, маршрут і output.
- Скрипти `lint`, `typecheck`, `test`, `build`, `synth`.
- Локальна перевірка без AWS-акаунта, ключів і деплою.

## Архітектура Фази 1

```text
Клієнт (браузер, curl, моніторинг)
              │
              │ GET /health
              ▼
API Gateway HTTP API
              │ AWS_PROXY (integration)
              ▼
AWS Lambda (Node.js 22)
              │
              ▼
HTTP 200 + JSON
```

Пояснення:

- **API Gateway HTTP API** приймає HTTP-запит і має публічний URL.
- **Lambda** виконує код обробника. У цій фазі — лише перевірку стану.
- **DynamoDB** ще немає. Вона з'явиться у Фазі 2.
- **Cognito** ще немає. Авторизація викладача з'явиться у Фазі 3.
- **Rate limiting** ще не налаштований. Його додамо разом із захистом API.

## Структура проєкту

```text
struct-lab-backend/
├── bin/
│   └── app.ts                    # Точка входу CDK-застосунку
├── lib/
│   └── struct-lab-stack.ts       # Опис інфраструктури: Lambda + HTTP API
├── src/
│   ├── constants.ts              # Спільні константи (назва сервісу)
│   └── handlers/
│       └── health.ts             # Код Lambda для GET /health
├── test/
│   ├── health.test.ts            # Тест обробника
│   └── struct-lab-stack.test.ts  # Тест CDK stack
├── docs/
│   └── phase-2-plan.md           # План наступної фази
├── cdk.json                      # Налаштування CDK CLI
├── eslint.config.mjs             # Правила лінтера
├── package.json                  # Залежності та скрипти
├── pnpm-lock.yaml                # Зафіксовані версії залежностей
├── pnpm-workspace.yaml           # Налаштування pnpm (дозвіл build-скрипта esbuild)
├── tsconfig.json                 # TypeScript для розробки та перевірки типів
├── tsconfig.build.json           # TypeScript для збірки в dist/
├── vitest.config.mts             # Налаштування тестів
├── .gitignore                    # Що не комітити в Git
└── README.md                     # Цей файл
```

### Призначення основних файлів

| Файл | Для чого потрібен |
| --- | --- |
| `bin/app.ts` | Створює CDK-застосунок і додає до нього `StructLabStack`. CDK CLI запускає цей файл командою з `cdk.json`. |
| `lib/struct-lab-stack.ts` | Описує хмарні ресурси: Lambda-функцію, HTTP API, маршрут і output з URL API. Це "креслення" інфраструктури. |
| `src/handlers/health.ts` | Безпосередньо код, який виконується в Lambda. Повертає JSON зі статусом. |
| `src/constants.ts` | Єдина назва сервісу, щоб не дублювати рядок у коді та тестах. |
| `test/health.test.ts` | Викликає обробник напряму й перевіряє статус-код і JSON. AWS не потрібен. |
| `test/struct-lab-stack.test.ts` | Синтезує stack у пам'яті та перевіряє, що Lambda й маршрут `GET /health` справді створюються. |
| `cdk.json` | Каже CDK CLI, який файл запускати для синтезу (`bin/app.ts`) і куди складати результат (`cdk.out/`). |
| `tsconfig.json` | Суворі правила TypeScript для всього проєкту, включно з тестами. |
| `tsconfig.build.json` | Окрема конфігурація для компіляції в `dist/` без тестів. |
| `vitest.config.mts` | Вказує Vitest, що тести лежать у `test/**/*.test.ts`. |
| `eslint.config.mjs` | Перевіряє TypeScript-код на типові помилки та неузгоджений стиль. |
| `package.json` | Скрипти, залежності, версія Node.js і pnpm. |
| `.gitignore` | Не дозволяє комітити `node_modules/`, `dist/`, `cdk.out/`, логи та `.env`. |

## Вимоги

- **Node.js 22+** (перевірено на Node.js 24).
- **pnpm 10+** (перевірено на pnpm 11.14).
- AWS-акаунт **не потрібен** для `lint`, `typecheck`, `test`, `build` і `synth`.

## Встановлення

```bash
pnpm install
```

`pnpm-workspace.yaml` уже дозволяє esbuild виконати свій build-скрипт. Якщо pnpm
все ж попросить підтвердження, виконайте:

```bash
pnpm approve-builds --all
```

## Команди для локальної перевірки

| Команда | Що робить | Звертається до AWS? |
| --- | --- | --- |
| `pnpm lint` | Перевіряє код ESLint. Порожній вивід = помилок немає. | Ні |
| `pnpm typecheck` | Перевіряє типи TypeScript без створення файлів. | Ні |
| `pnpm test` | Запускає всі тести Vitest один раз. | Ні |
| `pnpm test:watch` | Запускає тести у режимі спостереження. | Ні |
| `pnpm build` | Компілює `bin/`, `lib/`, `src/` у `dist/`. | Ні |
| `pnpm synth` | Генерує CloudFormation-шаблон у `cdk.out/`. | Ні |
| `pnpm cdk ...` | Проксі до CDK CLI, наприклад `pnpm cdk diff`. | `diff` — так, для реального акаунта |

Повний локальний цикл перевірки:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm synth
```

Очікувані результати:

- `lint` і `typecheck` завершуються без повідомлень про помилки;
- `test` показує `2 passed` файли та `4 passed` тести;
- `build` створює `dist/` з `.js`, `.d.ts` і source map файлами;
- `synth` створює `cdk.out/StructLabBackendStack.template.json`.

## Endpoint `GET /health`

Контракт:

- Метод: `GET`
- Шлях: `/health`
- Авторизація: відсутня (публічний endpoint)
- Відповідь: `200 OK`, `Content-Type: application/json`

Тіло відповіді:

```json
{
  "status": "ok",
  "service": "struct-lab-backend"
}
```

Після майбутнього деплою (не в цій фазі) запит виглядатиме так:

```bash
curl https://<api-id>.execute-api.<region>.amazonaws.com/health
```

Точний URL з'явиться в output `HttpApiUrl` після деплою. Зараз перевірити
поведінку можна тестом `pnpm test` — він викликає обробник напряму.

## Як працює `cdk synth`

1. CDK CLI читає `cdk.json` і бачить команду запуску `bin/app.ts`.
2. Через `pnpm exec ts-node` виконується `bin/app.ts`.
3. Код створює `StructLabStack`, де описані Lambda, HTTP API та маршрут.
4. `NodejsFunction` викликає esbuild і збирає `src/handlers/health.ts` в один
   JavaScript-файл для Lambda.
5. CDK формує CloudFormation-шаблон і складає його в `cdk.out/`.

`synth` **не створює** ресурсів в AWS, **не завантажує** файли в S3 і **не
потребує** AWS-ключів. Він лише готує локальний опис інфраструктури.

У stack навмисно не вказано `account` і `region`. Такий stack називається
environment-agnostic: конкретний акаунт і регіон визначаться під час деплою.

## Що не входить у Фазу 1

- DynamoDB і зберігання студентів.
- `POST /students` і `GET /admin/students`.
- Cognito та авторизація викладача.
- Rate limiting.
- CORS для фронтенду.
- Деплой в AWS, `cdk bootstrap`, AWS access keys.

Ці речі додані до плану наступних фаз, щоб Фаза 1 залишалася маленькою та
зрозумілою.

## Тестування

- `test/health.test.ts` перевіряє чистий обробник: статус 200, заголовок
  `content-type` і точний JSON. Жодних AWS-викликів.
- `test/struct-lab-stack.test.ts` використовує `aws-cdk-lib/assertions`, синтезує
  stack і перевіряє:
  - рівно одну Lambda-функцію з runtime `nodejs22.x`;
  - HTTP API з маршрутом `GET /health`;
  - наявність output `HttpApiUrl`.

Перший запуск тестів може бути повільнішим (приблизно 5–10 секунд), бо CDK
збирає Lambda-код через esbuild. Тому синтез у тесті має збільшений таймаут.

## Можливі проблеми

| Проблема | Рішення |
| --- | --- |
| `ERR_PNPM_IGNORED_BUILDS: esbuild` | Виконати `pnpm approve-builds --all`. У цьому проєкті дозвіл уже є в `pnpm-workspace.yaml`. |
| Тест CDK падає за таймаутом на повільній машині | Збільшити таймаут у `test/struct-lab-stack.test.ts` (зараз 30 секунд). |
| `cdk synth` пише "85 feature flags are not configured" | Це інформаційне повідомлення, не помилка. Синтез успішний. |
| `pnpm synth` не знаходить `ts-node` | Виконати `pnpm install`. |
| Потрібен деплой | Не робити в цій фазі. Для деплою знадобляться AWS-акаунт, налаштовані credentials і `cdk bootstrap`. |

## Безпека та Git

- Секретів і AWS-ключів у проєкті немає.
- `.env` і `.env.*` ігноруються Git (окрім майбутнього `.env.example`).
- `node_modules/`, `dist/`, `cdk.out/` і `coverage/` не комітяться.
- Публічний `/health` не містить чутливих даних.
- `/admin/students` у майбутньому обов'язково захистимо авторизацією до
  публічного деплою.

## Наступна фаза

Детальний план: [`docs/phase-2-plan.md`](docs/phase-2-plan.md).

Коротко:

1. Додати DynamoDB-таблицю `Students`.
2. Реалізувати `POST /students` з валідацією ПІБ і групи.
3. Реалізувати `GET /admin/students` з пагінацією.
4. Додати IAM-дозволи Lambda на таблицю та тести для нових маршрутів.

Авторизація викладача (Cognito) і rate limiting заплановані на наступні фази,
щоб спочатку стабілізувати роботу з даними.

## Корисні посилання

- [AWS CDK v2](https://docs.aws.amazon.com/cdk/v2/guide/)
- [API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [AWS Lambda Node.js runtime](https://docs.aws.amazon.com/lambda/latest/dg/lambda-nodejs.html)
- [Vitest](https://vitest.dev/)
