# Frontend Integration Contract

**P4-07.7.5b.** Бекенд розгорнуто вручну; інтеграція фронтенду — **PENDING**.
На розгорнутому бекенді E2E-01–E2E-09 дали **9/9 PASS**, зокрема перевірено
8/8 некоректних запитів до списку та 10/10 некоректних реєстрацій (разом
18/18). E2E-10 — **DEFERRED BY OPERATOR**. Це результати попередніх перевірок,
не перевірка з браузера StructLab.

**Deployed API base URL:**
`https://tstq9li2el.execute-api.eu-north-1.amazonaws.com` (HTTP API
`tstq9li2el`, stage `$default`).

Додавайте шлях маршруту безпосередньо до базового URL, без `/$default` чи
`/dev`. [Runbook](manual-deployment.md) містить історію розгортання,
[результати E2E](manual-deployment.md#91-scenario-results) та
[синтетичні записи для перевірки списку](manual-deployment.md#103-retained-synthetic-students).

## 1. Загальні правила

- JSON-відповіді, сформовані Lambda через спільний `jsonResponse`, мають
  `content-type: application/json` і `cache-control: no-store`. Це не
  поширюється на помилки, які генерує API Gateway без участі Lambda.
- Шляхи вказуються без завершального слеша: `/students`, `/admin/students`.
- Для `POST /students` надсилайте `Content-Type: application/json` (інакше
  `415`). Тіло понад 4096 декодованих байтів відхиляється з `413`.
- Cross-origin запити дозволені лише з `http://localhost:3000` (локальний
  Next.js). Preflight обробляє API Gateway; див. розділ 7.
- На `$default` налаштовано rate 10 запитів/с і burst 20. При перевищенні
  очікується `429 Too Many Requests`; поведінку під навантаженням не тестували
  (розділ 8).
- Для admin-запитів передавайте access token у
  `Authorization: Bearer <access-token>`. Cross-origin cookies не
  використовуються.
- Прикладні помилки мають форму:

```json
{
  "error": "string"
}
```

- `GET /health` і `POST /students` публічні.
- `GET /admin/students` потребує Cognito **access token**.
- Студенти не мають Cognito-акаунтів і не входять у систему.
- Публічного перегляду, редагування або видалення студентів немає.
- `fullName` і `group` — недовірений текст, який уводить публічний користувач.
  Рендерте його лише як текст із output encoding; не використовуйте raw HTML.

| Метод | Шлях | Авторизація | Успіх |
| --- | --- | --- | --- |
| `GET` | `/health` | Немає | `200` |
| `POST` | `/students` | Немає | `201` |
| `GET` | `/admin/students` | `Authorization: Bearer <access-token>` + група `teachers` | `200` |

## 2. Автентифікація викладача

### 2.1. Що налаштовано в Cognito

| Параметр | Значення |
| --- | --- |
| AWS region | `eu-north-1` |
| User Pool ID | `eu-north-1_5v0nXILuU` |
| App Client ID | `5abaa8u50uj7c4eii44goh2t2a` |
| App Client name | `structlab-dev-client` |
| App Client secret | відсутній (публічний клієнт) |
| Sign-in identifier | **email** (`UsernameAttributes=[email]`) |
| Self-sign-up | вимкнено |
| Створення акаунтів | лише адміністратором User Pool |
| MFA | inactive (`OFF`) |
| Password policy | live minimum 8 characters; full complexity policy not re-audited in P4-07.7.5b |
| Password history | not configured (live); CDK reference — 5 |
| Temporary password validity | 7 days (live); CDK reference — 3 days |
| Account recovery | verified email + verified phone (live); CDK reference — admin-only |
| User-existence errors | приховані (`PreventUserExistenceErrors: ENABLED`) |
| Auth flows | SRP (`ALLOW_USER_SRP_AUTH`), refresh (`ALLOW_REFRESH_TOKEN_AUTH`), `ALLOW_USER_AUTH` |
| OAuth / Managed Login | code flow enabled; domain `eu-north-15v0nxiluu`; callback `https://d84l1y8p4kdic.cloudfront.net` |
| Access token | 15 хвилин |
| ID token | 60 хвилин |
| Refresh token | 7 днів |
| Refresh-token rotation | вимкнено |
| Token revocation | увімкнено для App Client |
| Група доступу | exact case-sensitive `teachers` |

Для SRP у полі `Username` передавайте **email викладача**, а не внутрішнє
ім’я користувача Cognito чи `sub`. Адміністратор керує акаунтами й членством
у групі `teachers`.

SRP уже дозволено для цього клієнта. Також увімкнено OAuth code flow, але
зареєстрований callback веде на наявну стандартну сторінку перенаправлення
Cognito Managed Login. Скриншот успішного входу підтверджує автентифікацію
в Cognito, а не вхід із застосунку StructLab. Якщо команда обере redirect-based
вхід, їй потрібні обробка callback у фронтенді та окремо погоджений точний
callback URL цього застосунку.

### 2.2. Потік логіну

```text
1. Передумова: адміністратор додав акаунт викладача до групи teachers.
2. Викладач вводить email для входу.
3. Фронтенд автентифікує викладача через SRP або погоджений OAuth code flow.
4. Cognito повертає access token, ID token і refresh token.
5. Фронтенд бере саме access token.
6. Для admin-запитів додає заголовок:
   Authorization: Bearer <access-token>
```

ID token **не підходить** для адміністративного API. Backend перевіряє
`token_use === "access"` і відхилить ID token з `401`, навіть якщо в ньому є
група `teachers`.

### 2.3. Приклад SRP-логіну

Нижче — приклад раніше задокументованого SRP-потоку з
`amazon-cognito-identity-js`. Він показує, куди передавати email та звідки
брати access token; це приклад API бібліотеки, а не перелік залежностей StructLab.

```ts
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';

// memoryStorage — сховище лише в пам’яті, яке має надати фронтенд.
const userPool = new CognitoUserPool({
  UserPoolId: 'eu-north-1_5v0nXILuU',
  ClientId: '5abaa8u50uj7c4eii44goh2t2a',
  Storage: memoryStorage,
});

const cognitoUser = new CognitoUser({
  // email — фактичний sign-in identifier у live User Pool.
  Username: email,
  Pool: userPool,
  Storage: memoryStorage,
});

cognitoUser.authenticateUser(
  new AuthenticationDetails({ Username: email, Password: password }),
  {
    onSuccess: (session) => {
      const accessToken = session.getAccessToken().getJwtToken();
      // Зберегти accessToken для Authorization: Bearer ...
    },
    onFailure: (error) => {
      // Показати помилку входу; не логувати пароль або токени.
    },
    newPasswordRequired: () => {
      // Якщо Cognito вимагає зміни тимчасового пароля,
      // фронтенд має завершити цей challenge.
    },
  },
);
```

### 2.4. Термін дії та відновлення сесії

- Access token діє 15 хвилин.
- Refresh token діє 7 днів; refresh-token rotation вимкнено.
- Backend не має власного endpoint-а refresh або logout.
- Оновлення сесії слід реалізувати на боці клієнта через Cognito. Після `401`
  можна один раз оновити сесію та повторити `GET` з новим **access token**.
  Якщо сесію не відновлено або запит знову повернув `401`, потрібен новий вхід.
- Після завершення refresh token користувачу може знадобитися повторний вхід.
- Після зміни групи в Cognito вже виданий access token може містити старі групи
  до завершення терміну дії. Потрібен новий токен.
- Вихід із фронтенду не відкликає вже виданий access token. Не зберігайте токени
  довше, ніж потрібно, і не логуйте їх.
- Ці строки дії взято з конфігурації App Client. Вхід та оновлення сесії
  саме з фронтенду StructLab ще не перевіряли.

### 2.5. Заголовок авторизації

```http
Authorization: Bearer <access-token>
```

- Назва схеми: `Bearer`.
- Передається саме access token.
- Cookie-авторизація не використовується.
- Токен має бути виданий для налаштованого User Pool і App Client.

### 2.6. Паролі, recovery та user enumeration

- Для входу використовуйте параметри User Pool з розділу 2.1. Cognito
  налаштовано на відновлення через підтверджений email або номер телефону.
  У бекенді StructLab немає окремого API відновлення.
- `PreventUserExistenceErrors: ENABLED` означає, що помилки входу мають
  оброблятися узагальнено. Не показуйте різні повідомлення залежно від того, чи
  існує акаунт, і не робіть висновків про наявність користувача з тексту помилки.
  Це зменшує information disclosure, але не є гарантією проти всіх методів
  enumeration.
- E2E-03 verified real Cognito authentication. Password change, password reset,
  temporary-password expiry, account recovery, and user-enumeration behavior
  were not tested.

## 3. `GET /health`

Публічна перевірка доступності. Авторизація не потрібна.

```http
GET /health
```

Відповідь `200 OK`:

```json
{
  "status": "ok",
  "service": "struct-lab-backend"
}
```

Помилок, визначених застосунком, немає. Мережеві помилки або `5xx` від
інфраструктури слід обробляти як тимчасову недоступність.

## 4. `POST /students`

Публічна реєстрація студента. Заголовок `Authorization` не потрібен.
Cognito-акаунт не створюється.

### 4.1. Запит

```http
POST /students
Content-Type: application/json

{
  "fullName": "Іван Петренко",
  "group": "ІП-21"
}
```

`Content-Type: application/json` обов'язковий. Допускається параметр
`charset`, наприклад `application/json; charset=utf-8`; регістр назви заголовка
й media type не має значення.

Максимальний розмір тіла — **4096 decoded bytes**. Для UTF-8 рахуються байти,
а не JavaScript-довжина рядка; для base64 тіло спершу декодується. Перевірки
виконуються в порядку: `Content-Type` → розмір тіла → JSON parsing → валідація
полів → запис у DynamoDB.

Це **application-level** обмеження. API Gateway усе одно приймає більші payload
до platform limits; це не edge-level захист, не WAF і не anti-spam механізм.

TypeScript-тип:

```ts
interface CreateStudentRequest {
  fullName: string;
  group: string;
}
```

### 4.2. Валідація

Сервер застосовує правила до кожного запиту:

1. `Content-Type` має бути `application/json` (з опційним `charset`), інакше
   `415`.
2. Тіло не має перевищувати 4096 decoded bytes, інакше `413`.
3. Тіло обов'язкове, непорожнє і має бути валідним JSON.
4. JSON має бути об'єктом, не масивом, рядком або `null`.
5. `fullName` має бути рядком. Пробіли на початку й у кінці обрізаються; після
   цього довжина — від 1 до 200 символів.
6. `group` має бути рядком. Пробіли на початку й у кінці обрізаються; після
   цього довжина — від 1 до 50 символів.
7. Зайві поля ігноруються, але враховуються в розмірі тіла.
8. `studentId` і `createdAt` клієнт задати не може: сервер генерує їх сам.

Frontend може дублювати ці правила для зручності користувача, але саме серверна
валідація є джерелом істини. Для `fullName` та `group` сервер вимірює
`value.trim().length` (одиниці UTF-16), а для всього тіла запиту — байти.

### 4.3. Успішна відповідь

`201 Created`:

```json
{
  "studentId": "3f1d2c9b-7a44-4e1c-9f2a-0d2c8e5b1a77",
  "fullName": "Іван Петренко",
  "group": "ІП-21",
  "createdAt": "2026-11-11T18:00:00.000Z"
}
```

TypeScript-тип:

```ts
interface Student {
  studentId: string;
  fullName: string;
  group: string;
  createdAt: string;
}
```

`studentId` — UUID v4. `createdAt` — ISO 8601. Цей самий об'єкт зберігається в
DynamoDB.

**Безпечне відображення.** `fullName` і `group` — це довільний текст, який увів
публічний користувач. Не вставляйте ці поля через `innerHTML`,
`dangerouslySetInnerHTML` або інший raw HTML. Використовуйте текстовий
рендеринг фреймворку або явне escape/output encoding. Інакше можливий stored
XSS в admin-інтерфейсі викладача.

### 4.4. Помилки `413` і `415`

`415 Unsupported Media Type`:

```json
{
  "error": "Content-Type must be application/json"
}
```

`413 Payload Too Large`:

```json
{
  "error": "Request body must be at most 4096 bytes"
}
```

Для обох помилок запис у DynamoDB не створюється, а тіло запиту не логується.
Повторювати запит без виправлення `Content-Type` або зменшення тіла немає сенсу.

### 4.5. Помилки `400`

Відповідь:

```json
{
  "error": "fullName must be a non-empty string"
}
```

Точні повідомлення:

| Причина | `error` |
| --- | --- |
| Відсутнє або порожнє тіло | `Request body is required` |
| Невалідний JSON | `Request body must be valid JSON` |
| JSON не є об'єктом | `Request body must be a JSON object` |
| `fullName` не рядок / порожній після trim | `fullName must be a non-empty string` |
| `fullName` довший за 200 символів | `fullName must be at most 200 characters` |
| `group` не рядок / порожній після trim | `group must be a non-empty string` |
| `group` довший за 50 символів | `group must be at most 50 characters` |

`400` означає, що запис не створено; повторювати той самий запит без
виправлення немає сенсу.

### 4.6. Помилка `500`

```json
{
  "error": "Internal server error"
}
```

Це може бути помилка DynamoDB, ініціалізації Lambda або gateway-generated `500`
від Lambda throttling. Така відповідь може не мати звичайної JSON-структури
застосунку; деталі внутрішніх помилок навмисно не розкриваються.

Gateway-generated помилки, зокрема `500` від Lambda throttling, можуть не
містити CORS-заголовків. У браузері це може виглядати як мережева помилка, а не
як HTTP `500`. Заголовки, які додає Lambda (зокрема `cache-control: no-store` і
`content-type`), також не гарантуються для gateway-generated відповідей.

**Важливо:** у `POST /students` немає idempotency key. Не робіть автоматичний
retry `POST /students` після `500`, `429`, таймауту або мережевої помилки:
повторний запит може створити дублікат. Повторюйте лише після підтвердження
користувача.

### 4.7. Live verification

- E2E-01 student registration: **PASS** (`201`).
- E2E-02 DynamoDB persistence: **PASS**.
- Registration validation: **10/10 PASS** — eight `400`, one `415`, one `413`,
  with exact error bodies.
- POST attempts: **10**; unexpected results: **0**; ambiguous results: **0**;
  successful registration responses in the validation stage: **0**.
- No valid registration request was sent during the validation stage.
- Registration is **not idempotent**; an ambiguous request must not be retried
  blindly.

## 5. `GET /admin/students`

Захищений перегляд студентів. Потрібен Cognito access token викладача.

### 5.1. Запит

```http
GET /admin/students?limit=20
Authorization: Bearer <access-token>
```

Query-параметри:

| Параметр | Обов'язковий | Правила |
| --- | --- | --- |
| `limit` | Ні | Рядок із десяткових цифр; ціле число 1–100; за замовчуванням 20 |
| `cursor` | Ні | Непорожній непрозорий токен наступної сторінки |

Приклади:

```http
GET /admin/students
GET /admin/students?limit=50
GET /admin/students?limit=50&cursor=<nextCursor>
```

### 5.2. Успішна відповідь

`200 OK`:

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

TypeScript-тип:

```ts
interface ListStudentsResponse {
  items: Student[];
  nextCursor: string | null;
}
```

Правила:

- кожен елемент `items` має рівно чотири поля: `studentId`, `fullName`, `group`, `createdAt`;
- `nextCursor === null` означає, що сторінок більше немає;
- якщо `nextCursor` — рядок, його треба передати в наступний запит. Це не
  гарантує наявності ще одного запису;
- сторінка може містити `items: []` навіть тоді, коли `nextCursor` не `null`;
  термінальна сторінка також може бути порожньою. Порожній `items` — не помилка,
  якщо запит повернув `200`;
- cursor непрозорий: не розбирайте його, не змінюйте і не конструюйте вручну;
- порядок елементів нестабільний, бо backend використовує DynamoDB `Scan`.
  Не покладайтеся на сортування між сторінками.

**Безпечне відображення.** `fullName` і `group` — недовірений текст. Не
вставляйте їх через raw HTML; використовуйте текстовий рендеринг і output
encoding, як описано в розділі 4.3.

### 5.3. Пагінація

Передавайте `nextCursor` назад як query-параметр `cursor`, доки не отримаєте
`null`.

```ts
const apiBaseUrl = 'https://tstq9li2el.execute-api.eu-north-1.amazonaws.com';

const fetchAllStudents = async (accessToken: string): Promise<Student[]> => {
  const students: Student[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor !== null) {
      params.set('cursor', cursor);
    }

    const response = await fetch(
      `${apiBaseUrl}/admin/students?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Students request failed: ${response.status}`);
    }

    const page = (await response.json()) as ListStudentsResponse;
    students.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor !== null);

  return students;
};
```

Обмеження cursor:

- максимальна довжина — 512 символів;
- backend перевіряє base64url-формат, JSON-структуру та UUID v4;
- пошкоджений cursor повертає `400`, а не `500`.

### 5.4. Помилки `400`

| Причина | `error` |
| --- | --- |
| `limit` не цифри, `0`, більше 100, дробове або порожнє | `limit must be an integer between 1 and 100` |
| `cursor` переданий порожнім | `cursor must not be empty` |
| `cursor` невалідний або задовгий | `cursor is invalid` |

Приклад:

```json
{
  "error": "cursor is invalid"
}
```

### 5.5. `401 Unauthorized`

Можливі причини:

- API Gateway відхиляє запит, якщо:
  - відсутній заголовок `Authorization`;
  - токен невалідний, прострочений або має неправильний підпис;
  - токен виданий не для цього User Pool або App Client.
- Lambda повертає `401`, якщо JWT валідний, але це ID token або інший
  `token_use`, відмінний від `access`.

Якщо токен відхилений API Gateway, тіло `401` генерує API Gateway; воно може
відрізнятися від `{"error":"Unauthorized"}`. Якщо до запиту дійшла Lambda,
відповідь буде:

```json
{
  "error": "Unauthorized"
}
```

Фронтенд має обробляти насамперед HTTP-статус: спробувати оновити сесію, а потім
повернути викладача на екран входу.

### 5.6. `403 Forbidden`

За контрактом Lambda teacher guard повертає `403`, якщо access token не
містить точної групи `teachers`. E2E-06 спостерігав відповідь, сумісну з цим
контрактом; за самою HTTP-відповіддю неможливо незалежно встановити її джерело.

```json
{
  "error": "Forbidden"
}
```

Приклади, які не дають доступу:

- `cognito:groups` відсутній;
- група `Teachers` або `TEACHERS`;
- `teachers-extra`, `xteachers`, `admins,teachers`;
- лише інші групи.

Покажіть «Доступ заборонено». Не запускайте цикл оновлення сесії: повторний
запит із тим самим токеном не допоможе. Якщо адміністратор змінив членство у
групі, потрібен новий access token.

### 5.7. `500 Internal Server Error`

```json
{
  "error": "Internal server error"
}
```

Можлива причина — помилка DynamoDB, ініціалізації repository або
gateway-generated `500` від Lambda throttling. Деталі не розкриваються. Для
`GET` запит можна повторити з backoff, якщо це доречно; для `POST /students`
врахуйте ризик дубліката.

### 5.8. Live verification

- E2E-07 student listing: **PASS** (`200`).
- E2E-08 pagination: **PASS**.
- Authorization outcomes: no token → **401**; teacher access token → **200**;
  teacher ID token → **401**; valid non-teacher access token → **403**.
- No stable ordering is promised; an empty terminal page is valid.

## 6. Обробка помилок на фронтенді

### 6.1. Loading, empty and error states

- **Завантаження:** покажіть очікування відповіді; поки `POST` виконується,
  заблокуйте повторне надсилання форми. Під час завантаження наступної
  сторінки залишайте вже отримані рядки на екрані.
- **Порожній список:** показуйте його, лише якщо `nextCursor` став `null` і
  за весь обхід записів не було. Порожня остання сторінка завершує обхід, але
  не очищає таблицю.
- **Помилка:** спочатку перевірте HTTP-статус; читайте JSON з полем `error`,
  якщо воно є. Не показуйте сирий текст відповіді шлюзу.
- **Невідомий результат реєстрації:** повідомте користувача, що результат не
  підтверджено. Не повторюйте `POST` автоматично; за потреби наявність запису
  може перевірити авторизований викладач.

| Статус | Що робити |
| --- | --- |
| `200`, `201` | Використати JSON-відповідь |
| `400` | Показати `error`; виправити запит; не повторювати автоматично |
| `401` | Оновити Cognito-сесію; якщо не вдалося — повторний вхід |
| `403` | Показати «Доступ заборонено»; перевірити групу `teachers` |
| `404` | Перевірити шлях; для визначених маршрутів не очікується |
| `413` | Тіло завелике; зменшити payload; не повторювати автоматично |
| `415` | Виправити `Content-Type` на `application/json`; не повторювати автоматично |
| `429` | Для `GET` — обмежений retry з backoff. `POST /students` автоматично не повторювати |
| `5xx` | Можлива тимчасова помилка, зокрема Lambda throttling; показати загальне повідомлення; для `GET` — backoff |
| Мережева помилка | Для `GET` можливий retry; для `POST` є ризик дубліката |

Не показуйте користувачу сирі тексти помилок API Gateway або внутрішні деталі.
Для `POST /students` не робіть автоматичний retry після таймауту, `429` або
`500` без окремого рішення щодо ідемпотентності.

Cognito authentication errors (sign-in, password change, temporary-password
expiry, recovery) обробляйте узагальнено: не розкривайте, чи існує акаунт, і не
робіть висновків про наявність користувача з тексту помилки. Не припускайте
admin-only recovery: це налаштування CDK, а не робочого User Pool (розділ 2.1).

## 7. CORS

CORS налаштований нативно на API Gateway HTTP API. Окремого `OPTIONS`-маршруту
немає, Lambda не додає CORS-заголовків: preflight обробляє API Gateway до
виклику інтеграції.

| Параметр | Значення |
| --- | --- |
| Дозволені origins | `http://localhost:3000` |
| Дозволені методи | `GET`, `POST` |
| Дозволені headers | `content-type`, `authorization` |
| `AllowCredentials` | `false` |
| `MaxAge` | `300` секунд |
| Wildcards | заборонені |

`Authorization: Bearer <access-token>` передається явно в заголовку. Cross-origin
cookies не використовуються і не підтримуються, бо `AllowCredentials: false`.
Origin перевіряється точно: схема, host і port мають збігатися.

### 7.1. Локальна розробка Next.js

Запускайте Next.js на `http://localhost:3000` (`pnpm dev`). Цей origin уже
дозволений, тому окремий dev-proxy не потрібен.

`POST /students` із `Content-Type: application/json` і `GET /admin/students` із
`Authorization` викликають браузерний preflight. Браузер робить його
автоматично; не надсилайте `OPTIONS` вручну і не додавайте CORS-заголовки в
Next.js. Успішний preflight — це 2xx із потрібними `access-control-*`
заголовками. Initial live smoke tests observed `204` for the allowed preflight;
recheck the actual browser behavior before a frontend release.

Якщо порт 3000 зайнятий і Next.js обрав інший, це вже інший origin. Для роботи
з наявною конфігурацією звільніть порт 3000 і відкрийте саме
`http://localhost:3000`, а не `http://127.0.0.1:3000`.

### 7.2. Інший origin фронтенду

Перед запуском фронтенду з іншого origin перевірте фактичний CORS HTTP API
`tstq9li2el`. Якщо нового origin немає, потрібна окремо схвалена зміна allowlist
цього API: точний HTTPS-origin без шляху, trailing slash чи wildcard.
`DEV_ENVIRONMENT.corsAllowedOrigins` у `lib/environments.ts` описує CDK;
редагування файлу або `cdk synth` не змінює вручну налаштований API.
Callback URL Cognito і CORS allowlist API Gateway — різні налаштування.

### 7.3. Межі CORS

- CORS — не автентифікація. `GET /admin/students` усе одно вимагає Cognito
  access token і групу `teachers`.
- CORS — не rate limiting, не WAF і не захист від спаму. Він лише обмежує
  браузерні cross-origin запити.
- CORS виконується браузером. Серверні клієнти та curl його ігнорують.
- Відповіді `401`, `403`, `429` і gateway-generated `500` від Lambda throttling
  можуть не містити CORS-заголовків, якщо їх генерує API Gateway, а не
  інтеграція. Це не було незалежно перевірено для gateway-generated відповідей;
  перевірте перед frontend release.

## 8. Throttling

API Gateway застосовує throttling до існуючого default stage `$default` через
`DefaultRouteSettings`:

| Параметр | Значення |
| --- | --- |
| Rate limit | 10 requests per second |
| Burst limit | 20 |
| Stage | `$default` |
| Перевищення | `429 Too Many Requests` — expected; not load-tested live |

Throttling — best-effort обмеження на рівні stage, а не per-IP або per-user
quota. Усі клієнти поділяють один ліміт; один клієнт може вичерпати burst для
інших. Це не гарантований hard limit, не WAF і не spending cap. Lambda reserved
concurrency не налаштований, тому throttling не обмежує кількість одночасних
Lambda-викликів.

### 8.1. Lambda concurrency

Станом на P4-02.4 dev-акаунт має 10 unreserved concurrent executions, які
поділяють усі три Lambda-функції. Це account-specific snapshot, а не постійний
ліміт AWS Free Plan; квоту не перевіряли повторно в P4-07.7.5b. Reserved і
provisioned concurrency не налаштовані.

Сплеск публічних `POST /students` може вичерпати спільний pool, і тоді
`GET /health` та admin-запити тимчасово не виконуватимуться. API Gateway
throttling (`10 req/s`, burst `20`) не гарантує concurrency isolation, per-IP
fairness або hard spending cap. Якщо Lambda throttling спрацьовує, API Gateway
може повернути gateway-generated `500`, а не `429`; така відповідь може бути без
CORS-заголовків.

Обробка на фронтенді:

- Покажіть зрозуміле повідомлення про тимчасове перевантаження.
- Не робіть агресивних автоматичних retry. Якщо retry потрібен, використовуйте
  exponential backoff з jitter і обмежену кількість спроб.
- Якщо відповідь містить `Retry-After`, дочекайтеся вказаного часу.
- Для `POST /students` автоматичний retry після `429`, `500` або таймауту може
  створити дублікат: idempotency не реалізована. Повторюйте лише після
  підтвердження користувача.
- `500` від Lambda throttling трактуйте як тимчасову помилку; для `GET`
  використовуйте backoff, для `POST /students` не повторюйте автоматично.
- `GET`-запити зазвичай можна повторити з backoff.

Контрольована перевірка `429` і gateway-generated `500` від Lambda throttling
ще не виконувалася; вона потребує окремого схвалення. Не припускайте, що ці
відповіді містять CORS-заголовки: API Gateway може згенерувати їх без CORS.

## 9. Що фронтенд не повинен робити

- Не створювати Cognito-акаунти для студентів.
- Не використовувати ID token для `/admin/students`.
- Не використовувати username-only login: live sign-in identifier — **email**.
- Не вважати Cognito Managed Login's default redirect page сторінкою StructLab
  frontend; frontend integration залишається pending.
- Не передавати access token у query string або логах.
- Не надсилати JSON із `Content-Type: text/plain`; для `POST /students`
  обов'язковий `application/json`.
- Не надсилати тіло більше 4096 decoded bytes і не розраховувати на цей ліміт
  як на anti-spam або edge-level захист.
- Не викликати API з origin, відмінного від `http://localhost:3000` (локально)
  або явно доданого HTTPS-origin (після деплою).
- Не покладатися на cross-origin cookies; передавайте access token у
  `Authorization`.
- Не додавати власні CORS-заголовки або `OPTIONS`-обробник: preflight уже
  обробляє API Gateway.
- Не робити агресивних retry після `429` або `500`; для `POST /students` це може
  створити дублікат.
- Не вважати throttling per-IP квотою, гарантованим spending cap або
  concurrency isolation: усі клієнти поділяють спільний Lambda pool.
- Не розбирати та не модифікувати `nextCursor`.
- Не покладатися на стабільне сортування студентів.
- Не вважати, що backend перевіряє особу студента або унікальність запису.
- Не розраховувати на публічний список, редагування або видалення студентів.
- Не рендерити `fullName` або `group` як raw HTML; використовуйте безпечний
  текстовий рендеринг та output encoding.

## 10. Чекліст інтеграції

1. Manual AWS deployment уже виконано; використовуйте base URL
   `https://tstq9li2el.execute-api.eu-north-1.amazonaws.com`. Не шукайте
   `HttpApiUrl` у stack outputs, бо CloudFormation stack не створювався.
2. Використовуйте documented `UserPoolId` `eu-north-1_5v0nXILuU` і
   `UserPoolClientId` `5abaa8u50uj7c4eii44goh2t2a`; якщо operator змінив
   ресурси, перевірте актуальні значення перед інтеграцією.
3. Налаштуйте Cognito SDK для **email-based sign-in**.
4. Для перевірки списку використовуйте вже підготовлений акаунт викладача з
   групи `teachers`. Два збережені синтетичні записи дають змогу перевірити
   пагінацію з `limit=1` без нової реєстрації.
5. Реалізуйте SRP-логін або окремо погоджений OAuth code flow; зберігайте
   access token у пам'яті, а не в довгоживущому сховищі.
6. Перевірте `GET /health`.
7. Реалізуйте публічну форму з валідацією `fullName` і `group`, заголовком
   `Content-Type: application/json` і тілом до 4096 байт.
8. Реалізуйте admin-таблицю з пагінацією через `nextCursor`; не покладайтеся на
   сортування і коректно обробляйте порожню термінальну сторінку.
9. Обробіть `400`, `401`, `403`, `413`, `415`, `429`, `500` і мережеві помилки.
10. Реалізуйте backoff для `429`/тимчасових `5xx` і не робіть автоматичний
    retry `POST /students`.
11. Перевірте, що Next.js працює на `http://localhost:3000` і preflight до
    `/students` та `/admin/students` проходить (CORS уже налаштований).
12. Перед розгортанням frontend на іншому origin перевірте фактичну
    CORS-конфігурацію і додайте точний HTTPS-origin окремо схваленим
    розгортанням.
13. Реалізуйте loading, empty і error states; не показуйте сирі тексти API
    Gateway і не робіть автоматичний retry неоднозначного `POST`.
14. Відображайте `fullName` і `group` лише як текст із output encoding; не
    використовуйте raw HTML.
15. Не вважайте Cognito Managed Login's default redirect page frontend
    integration. Контрольована перевірка `429` і gateway-generated `500` ще
    не виконувалася.
