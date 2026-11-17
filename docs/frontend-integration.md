# Frontend Integration Contract

**Статус:** контракт відповідає реалізованому backend (Фаза 3, P4-02.1
request hardening, P4-02.2 CORS і P4-02.3 throttling). AWS-деплой ще не
виконувався, тому реальної базової URL-адреси поки немає. Після деплою її треба
взяти зі stack output `HttpApiUrl`.

Цей документ описує лише те, що реально реалізовано в коді. Він не додає
endpoint-ів, полів або поведінки, яких немає в backend.

## 1. Загальні правила

- Усі відповіді API мають `content-type: application/json`.
- Базовий URL: значення output `HttpApiUrl`, наприклад
  `https://<api-id>.execute-api.<region>.amazonaws.com`.
- Шляхи вказуються без завершального слеша: `/students`, `/admin/students`.
- Для запитів із тілом надсилайте `Content-Type: application/json`.
  `POST /students` приймає щонайбільше 4096 decoded bytes; інакше — `413` або
  `415`.
- Cross-origin запити дозволені лише з `http://localhost:3000` (локальний
  Next.js). Preflight обробляє API Gateway; див. розділ 7.
- API Gateway обмежує `$default` stage до 10 req/s і burst 20. Перевищення
  повертає `429 Too Many Requests`; див. розділ 8.
- Для admin-запитів передавайте access token у
  `Authorization: Bearer <accessToken>`. Cross-origin cookies не
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
| `GET` | `/admin/students` | `Authorization: Bearer <accessToken>` + група `teachers` | `200` |

## 2. Автентифікація викладача

### 2.1. Що налаштовано в Cognito

| Параметр | Значення |
| --- | --- |
| User Pool ID | output `UserPoolId` |
| App Client ID | output `UserPoolClientId` |
| App Client secret | відсутній (публічний клієнт) |
| Self-sign-up | вимкнено |
| Створення акаунтів | лише адміністратором User Pool |
| Auth flow | SRP |
| OAuth / Hosted UI | вимкнено |
| Access token | 30 хвилин |
| Група доступу | `teachers` |
| Username | фактичний username акаунта; email не є alias автоматично |

`Username` для SRP має точно збігатися з username, який адміністратор задав під
час створення акаунта. У поточній конфігурації User Pool не має
`UsernameAttributes` або `AliasAttributes`, тому email не стає alias
автоматично: якщо акаунт створено з username `teacher1`, вхід з email не
працюватиме.

Оскільки Hosted UI і OAuth вимкнені:

- не можна використовувати redirect на Cognito Hosted UI;
- немає `/oauth2/authorize`, `/login` або callback URL;
- логін виконується безпосередньо з фронтенду через Cognito SDK з підтримкою
  SRP.

### 2.2. Потік логіну

```text
1. Адміністратор створює викладача в Cognito User Pool.
2. Адміністратор додає викладача до групи teachers.
3. Фронтенд виконує SRP-логін із UserPoolId і UserPoolClientId.
4. Cognito повертає access token, ID token і refresh token.
5. Фронтенд бере саме access token.
6. Для admin-запитів додає заголовок:
   Authorization: Bearer <accessToken>
```

ID token **не підходить** для адміністративного API. Backend перевіряє
`token_use === "access"` і відхилить ID token з `401`, навіть якщо в ньому є
група `teachers`.

### 2.3. Приклад SRP-логіну

Нижче — ілюстративний приклад із `amazon-cognito-identity-js`. Це вибір
фронтенд-проєкту; backend не додає цю залежність.

```ts
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js';

const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: USER_POOL_CLIENT_ID,
});

const cognitoUser = new CognitoUser({
  // username — фактичний username акаунта в Cognito, не обов'язково email.
  Username: username,
  Pool: userPool,
});

cognitoUser.authenticateUser(
  new AuthenticationDetails({ Username: username, Password: password }),
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

Якщо використовується AWS Amplify, еквівалентом є `signIn` із наступним
`fetchAuthSession()`; для запитів усе одно потрібен **access token**, а не ID
token.

### 2.4. Термін дії та відновлення сесії

- Access token діє 30 хвилин.
- Backend не має власного endpoint-а refresh або logout.
- Оновлення токена виконує Cognito SDK на фронтенді.
- Після `401` слід спробувати оновити сесію, а якщо це неможливо — повернути
  викладача на екран входу.
- Після зміни групи в Cognito вже виданий access token може містити старі групи
  до завершення терміну дії. Потрібен новий токен.
- Вихід із фронтенду не відкликає вже виданий access token. Не зберігайте токени
  довше, ніж потрібно, і не логуйте їх.

### 2.5. Заголовок авторизації

```http
Authorization: Bearer <accessToken>
```

- Назва схеми: `Bearer`.
- Передається саме access token.
- Cookie-авторизація не використовується.
- Токен має бути виданий для налаштованого User Pool і App Client.

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
валідація є джерелом істини.

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

Це може бути помилка DynamoDB або ініціалізації Lambda. Деталі навмисно не
розкриваються.

**Важливо:** у `POST /students` немає idempotency key. Якщо клієнт не отримав
відповідь через мережеву помилку, а запис уже створився, повторний POST створить
дублікат. Автоматичний retry слід робити обережно.

## 5. `GET /admin/students`

Захищений перегляд студентів. Потрібен Cognito access token викладача.

### 5.1. Запит

```http
GET /admin/students?limit=20
Authorization: Bearer <accessToken>
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

- `items` містить рівно поля `studentId`, `fullName`, `group`, `createdAt`;
- `nextCursor === null` означає, що сторінок більше немає;
- `nextCursor` — рядок означає, що є наступна сторінка;
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
const fetchAllStudents = async (accessToken: string): Promise<Student[]> => {
  const students: Student[] = [];
  let cursor: string | null = null;

  do {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor !== null) {
      params.set('cursor', cursor);
    }

    const response = await fetch(
      `${API_BASE_URL}/admin/students?${params.toString()}`,
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

- відсутній заголовок `Authorization`;
- токен невалідний, прострочений або має неправильний підпис;
- токен виданий не для цього User Pool або App Client;
- у Lambda потрапив ID token або інший `token_use`, відмінний від `access`.

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

Access token валідний, але не містить точної групи `teachers`.

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

Повторний запит із тим самим токеном не допоможе. Потрібно перевірити членство в
групі `teachers` і отримати новий токен.

### 5.7. `500 Internal Server Error`

```json
{
  "error": "Internal server error"
}
```

Можлива причина — помилка DynamoDB або ініціалізації repository. Деталі не
розкриваються. Для `GET` запит можна повторити з backoff, якщо це доречно.

## 6. Обробка помилок на фронтенді

| Статус | Що робити |
| --- | --- |
| `200`, `201` | Використати JSON-відповідь |
| `400` | Показати `error`; виправити запит; не повторювати автоматично |
| `401` | Оновити Cognito-сесію; якщо не вдалося — повторний вхід |
| `403` | Показати «Доступ заборонено»; перевірити групу `teachers` |
| `404` | Перевірити шлях; для визначених маршрутів не очікується |
| `413` | Тіло завелике; зменшити payload; не повторювати автоматично |
| `415` | Виправити `Content-Type` на `application/json`; не повторювати автоматично |
| `429` | Зачекати й повторити з backoff; для `POST /students` врахувати ризик дубліката |
| `5xx` | Показати загальну помилку; для `GET` можливий backoff |
| Мережева помилка | Для `GET` можливий retry; для `POST` є ризик дубліката |

Не показуйте користувачу сирі тексти помилок API Gateway або внутрішні деталі.
Для `POST /students` не робіть автоматичний retry після таймауту або `429` без
окремого рішення щодо ідемпотентності.

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

`Authorization: Bearer <accessToken>` передається явно в заголовку. Cross-origin
cookies не використовуються і не підтримуються, бо `AllowCredentials: false`.
Origin перевіряється точно: схема, host і port мають збігатися.

### 7.1. Локальна розробка Next.js

Запускайте Next.js на `http://localhost:3000` (`pnpm dev`). Цей origin уже
дозволений, тому окремий dev-proxy не потрібен.

`POST /students` із `Content-Type: application/json` і `GET /admin/students` із
`Authorization` викликають браузерний preflight. Браузер робить його
автоматично; не надсилайте `OPTIONS` вручну і не додавайте CORS-заголовки в
Next.js.

Якщо port 3000 зайнятий і Next.js обрав інший port, цей origin не буде
дозволений. Звільніть port або додайте точний новий origin у
`DEV_ENVIRONMENT.corsAllowedOrigins` (`lib/environments.ts`) і виконайте
локальні перевірки та новий деплой. Wildcard використовувати не можна.

### 7.2. Майбутній задеплоєний фронтенд

Коли з'явиться HTTPS-домен фронтенду, додайте його точний origin, наприклад
`https://struct-lab.example.com`, у `DEV_ENVIRONMENT.corsAllowedOrigins`.
Валідатор дозволяє HTTPS для будь-якого host, але відхиляє trailing slash, шлях,
query string, fragment, credentials, дублікати і wildcards. Зміна потребує
нового синтезу й деплою; до цього вона не діє.

### 7.3. Межі CORS

- CORS — не автентифікація. `GET /admin/students` усе одно вимагає Cognito
  access token і групу `teachers`.
- CORS — не rate limiting, не WAF і не захист від спаму. Він лише обмежує
  браузерні cross-origin запити.
- CORS виконується браузером. Серверні клієнти та curl його ігнорують.
- Відповіді `401`, `403` і `429`, які API Gateway генерує до виклику Lambda,
  можуть не містити CORS-заголовків. Це треба перевірити після деплою; локальні
  тести та синтез цього не підтверджують.

## 8. Throttling

API Gateway застосовує throttling до існуючого default stage `$default` через
`DefaultRouteSettings`:

| Параметр | Значення |
| --- | --- |
| Rate limit | 10 requests per second |
| Burst limit | 20 |
| Stage | `$default` |
| Перевищення | `429 Too Many Requests` |

Throttling — best-effort обмеження на рівні stage, а не per-IP або per-user
quota. Усі клієнти поділяють один ліміт; один клієнт може вичерпати burst для
інших. Це не гарантований hard limit, не WAF і не spending cap. Lambda reserved
concurrency не налаштований, тому throttling не обмежує кількість одночасних
Lambda-викликів.

Обробка на фронтенді:

- Покажіть зрозуміле повідомлення про тимчасове перевантаження.
- Не робіть агресивних автоматичних retry. Якщо retry потрібен, використовуйте
  exponential backoff з jitter і обмежену кількість спроб.
- Якщо відповідь містить `Retry-After`, дочекайтеся вказаного часу.
- Для `POST /students` автоматичний retry після `429` або таймауту може
  створити дублікат: idempotency не реалізована. Повторюйте лише після
  підтвердження користувача.
- `GET`-запити зазвичай можна повторити з backoff.

Post-deploy перевірка: під контрольованим навантаженням підтвердити, що
перевищення ліміту дає `429`, а відповідь містить CORS-заголовки для
дозволеного origin. Локальні тести перевіряють лише синтезовану конфігурацію.

## 9. Що фронтенд не повинен робити

- Не створювати Cognito-акаунти для студентів.
- Не використовувати ID token для `/admin/students`.
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
- Не робити агресивних retry після `429`; для `POST /students` це може створити
  дублікат.
- Не вважати throttling per-IP квотою або гарантованим spending cap.
- Не розбирати та не модифікувати `nextCursor`.
- Не покладатися на стабільне сортування студентів.
- Не вважати, що backend перевіряє особу студента або унікальність запису.
- Не розраховувати на публічний список, редагування або видалення студентів.
- Не рендерити `fullName` або `group` як raw HTML; використовуйте безпечний
  текстовий рендеринг та output encoding.

## 10. Чекліст інтеграції

1. Задеплоїти stack (окрема фаза; у Фазі 3 деплою не було).
2. Взяти `HttpApiUrl`, `UserPoolId` і `UserPoolClientId` зі stack outputs.
3. Налаштувати Cognito SDK із цими `UserPoolId` та `UserPoolClientId`.
4. Створити викладача через адміністратора Cognito і додати до групи `teachers`.
5. Реалізувати SRP-логін і зберігати access token у пам'яті.
6. Перевірити `GET /health`.
7. Реалізувати публічну форму з валідацією `fullName` і `group`, заголовком
   `Content-Type: application/json` і тілом до 4096 байт.
8. Реалізувати admin-таблицю з пагінацією через `nextCursor`.
9. Обробити `400`, `401`, `403`, `413`, `415`, `429`, `500` і мережеві помилки.
10. Реалізувати backoff для `429` і не робити автоматичний retry `POST /students`.
11. Перевірити, що Next.js працює на `http://localhost:3000` і preflight до
    `/students` та `/admin/students` проходить (CORS уже налаштований).
12. Після деплою перевірити `429` під контрольованим навантаженням і CORS на
    цій відповіді.
13. Рендерити `fullName` і `group` лише як текст із output encoding; не
    використовувати raw HTML.
