# Manual AWS Deployment Runbook and Team Handoff

- **Checkpoint:** P4-07.5
- **Last updated:** 2026-11-25
- **Repository:** <https://github.com/akio-q/struct-lab-backend>
- **Branch:** `feat/manual-aws-deployment`
- **Packaging commit:** `7b7f9317ec7eec9ff0fb9f4cc58d97221086f87c`
- **Checkpoint base commit:** `b120dafb71fa608749323cdc5196625708671fc9`
- **Deployment state:** Lambda deployment **COMPLETE**; API Gateway integration **PENDING**; Cognito JWT, real teacher authorization, valid student registration, DynamoDB persistence, pagination, and frontend integration **NOT VERIFIED**.
- **Next action:** P4-07.6 — API Gateway Configuration.

> This is an operational runbook, not a claim that the backend API is deployed or end-to-end verified. Every AWS mutation requires explicit operator approval. This repository is public: do not store credentials, passwords, access keys, session tokens, JWTs, student data, teacher usernames, email addresses, personal identifiers, or local filesystem paths in it.

## 1. Deployment approach

### Why direct AWS CLI instead of CDK deployment

The P4-07 phase required real AWS resources without using CloudFormation, CDK deployment, or Docker. Direct AWS CLI deployment was chosen so that:

- each resource creation or update is visible as an individual command;
- each mutation can be approved and verified separately;
- no `cdk bootstrap`, `cdk deploy`, or CloudFormation stack state is introduced in this phase;
- failures can be stopped and reported without an automatic stack rollback or broad permission change.

The existing CDK code remains the reference design. It was not modified and is not the deployed state:

- `lib/struct-lab-stack.ts` — intended Lambda, API Gateway, Cognito, DynamoDB, logging, and alarm configuration;
- `lib/environments.ts` — pinned dev account and region;
- `bin/app.ts` — stack wiring and environment validation;
- `test/` — infrastructure and runtime regression coverage.

No `cdk bootstrap`, `cdk diff`, `cdk deploy`, or `cdk destroy` has been run for this deployment.

### Approval model

- Read-only checks may be run to establish state.
- All create, update, and delete operations require explicit operator approval.
- Do not silently switch AWS profiles or regions.
- Do not broaden permissions or delete partially created resources to recover from a failure. Stop and report the partial state.

## 2. Repository checkpoint

| Item | Value |
| --- | --- |
| Remote | `https://github.com/akio-q/struct-lab-backend.git` |
| Branch | `feat/manual-aws-deployment` |
| Packaging commit | `7b7f9317ec7eec9ff0fb9f4cc58d97221086f87c` — `feat(deployment): add local Lambda packaging and verification` |
| Working tree at checkpoint start | Clean |
| Lambda deployment commit | None — P4-07.5 changed AWS resources only; no repository change |
| Last full regression | 247/247 PASS, including 28 infrastructure tests (reported; not rerun for this documentation checkpoint) |
| Package manager | `pnpm@11.14.0` |
| Required Node.js | `>=22` |
| Local Node.js used for packaging | `v24.18.0` |

The checkpoint commit for this document is created separately and pushed to the existing remote feature branch without force.

Generated Lambda ZIP archives are ignored by Git:

```text
.gitignore: dist/
```

Never stage or commit `dist/` or any generated ZIP archive.

## 3. AWS target and access

| Parameter | Value |
| --- | --- |
| AWS account | `677339799150` |
| AWS region | `eu-north-1` |
| AWS CLI profile | `structlab-dev` |
| Environment | `dev` |
| CDK stack name (reference only) | `StructLabBackendStack-dev` |
| Manual IAM tag set | `Project=StructLab`, `Service=struct-lab-backend`, `Environment=dev`, `ManagedBy=Manual` |

The account and region are pinned in `lib/environments.ts`. Do not use ad-hoc account or region values.

### Session reauthentication

Use the approved profile and explicit region on every AWS command:

```powershell
aws sts get-caller-identity --profile structlab-dev --region eu-north-1
aws configure get region --profile structlab-dev
```

Expected identity:

- account `677339799150`;
- an assumed role, **not** the root user;
- region `eu-north-1`.

Reauthenticate the existing `structlab-dev` profile with:

```powershell
aws login --profile structlab-dev
```

Use this command for the existing profile; do not substitute a different login method. Do not paste credentials into files, chat, or shell history. If the account, region, or caller is unexpected, stop.

### Free Plan, credits, budget, and email status

| Item | Last verified state |
| --- | --- |
| AWS plan | `FREE` |
| Plan status | `ACTIVE` (re-verified after P4-07.5) |
| Remaining credits | `$159.999971` (last reported; unchanged through P4-07.5) |
| Plan expiration | `2027-05-12` |
| Budget | `StructLab-Zero-Spend` |
| Budget amount | `$1.00` monthly |
| Amount used at verification | `$0.00` |
| Budget health | `Healthy` |
| Budget alert threshold | Actual cost > `$0.01` |
| Budget alert recipient email | Verified (address not stored) |
| Credits in budget calculation | Unverified |
| Account-specific DynamoDB Free Tier usage | Unverified |

Free Plan credits and allowances are finite. CloudWatch Logs, alarms, requests, and other usage can consume credits after free allowances.

## 4. Completed and pending stages

| Stage | Status |
| --- | --- |
| P4-01 through P4-06 | Completed |
| P4-07.1 — Local Repository Audit | Completed |
| P4-07.2 — Manual Deployment Plan | Completed |
| P4-07.2a — AWS CLI & Permissions Preflight | Completed |
| P4-07.3 — Lambda Bundling & ZIP Packaging | Completed and committed as `7b7f931` |
| P4-07.4a — Billing & Free Plan Verification | Completed |
| P4-07.4b — DynamoDB Configuration | Completed |
| P4-07.4c — Cognito Configuration | Completed with documented limitations |
| P4-07.4d — IAM Execution Roles | Completed with documented limitations |
| P4-07.4 — Checkpoint & Team Handoff | Completed |
| P4-07.5 — Lambda Deployment | Completed — three functions deployed and smoke-tested |
| P4-07.6 — API Gateway Configuration | **Next; not started** |
| Backend API verification | Pending; requires API Gateway integration |
| Cognito JWT and real teacher authorization verification | Pending |
| Valid student registration and DynamoDB persistence verification | Pending |
| Teacher-authorized listing and pagination verification | Pending |
| Frontend integration verification | Pending |
| Test-resource cleanup | Pending; separate approval required |

## 5. Resources already created or configured

### 5.1 DynamoDB

The target table was created during P4-07.4b through the AWS CLI, not by the CDK stack.

| Property | Verified value |
| --- | --- |
| Table name | `StructLabStudents-dev` |
| Table ARN | `arn:aws:dynamodb:eu-north-1:677339799150:table/StructLabStudents-dev` |
| Status | `ACTIVE` |
| Partition key | `studentId` (String) |
| Capacity | Provisioned; `10` read capacity units / `10` write capacity units (live `ProvisionedThroughput`) |
| Deletion protection | Enabled |
| Encryption | AWS-owned key (default); no customer-managed KMS key |
| Point-in-time recovery | Not enabled |
| TTL | Not enabled |
| Global/local secondary indexes | None |
| Streams | Disabled |
| Replicas | None |
| Auto Scaling | Not configured |
| Items at last verification | `0` |

No DynamoDB data operation was performed during the IAM, documentation, or Lambda deployment stages.

### 5.2 Cognito

| Property | Verified value |
| --- | --- |
| User Pool ID | `eu-north-1_5v0nXILuU` |
| User Pool name | `User pool - nobwzm` |
| Feature plan | `ESSENTIALS` |
| Deletion protection | `ACTIVE` |
| Self-registration | Disabled (`AllowAdminCreateUserOnly=true`) |
| MFA | `OFF` |
| Account recovery | `verified_email`, `verified_phone_number` |
| Cognito domain | `eu-north-15v0nxiluu` |
| Estimated users | `1` |
| App Client ID | `5abaa8u50uj7c4eii44goh2t2a` |
| App Client name | `structlab-dev-client` |
| Client secret | None |
| Explicit auth flows | `ALLOW_REFRESH_TOKEN_AUTH`, `ALLOW_USER_AUTH`, `ALLOW_USER_SRP_AUTH` |
| Access token validity | 15 minutes |
| ID token validity | 60 minutes |
| Refresh token validity | 7 days |
| Token revocation | Enabled |
| Refresh token rotation | `DISABLED` |
| `PreventUserExistenceErrors` | `ENABLED` |
| Auth session validity | 3 minutes |
| OAuth flows | `code` |
| OAuth scopes | `email`, `openid`, `phone` |
| OAuth enabled on client | Yes |
| Callback URL | `https://d84l1y8p4kdic.cloudfront.net` |
| Logout URLs | Not set |
| Default redirect URI | Not set |
| Supported identity providers | `COGNITO` |
| `teachers` group | Exists; exactly 1 confirmed test teacher; no IAM role |
| `structlab-test-teachers` group | Exists; same member; no IAM role |

The test teacher username is intentionally withheld. Group membership alone does not prove end-to-end teacher authorization.

#### Cognito security mismatches left unchanged

These differences from the CDK reference were observed and intentionally preserved during P4-07.4c. They require separate approval before any change.

| Setting | CDK reference | Live configuration |
| --- | --- | --- |
| Minimum password length | 12 | 8 |
| Password history | 5 | Not configured |
| Temporary password validity | 3 days | 7 days |
| Account recovery | `NONE` | Verified email + verified phone |
| OAuth on app client | Not configured | Code flow enabled with CloudFront callback |
| Cognito domain | Not configured | `eu-north-15v0nxiluu` exists |
| Extra auth flow | `ALLOW_USER_AUTH` not configured | `ALLOW_USER_AUTH` enabled |
| Feature plan | `ESSENTIALS` | `ESSENTIALS` |
| Deletion protection | Enabled | `ACTIVE` |
| Self-signup | Disabled | Disabled |
| MFA default | Off | `OFF` |

Do not weaken authentication or authorization controls. Do not remove OAuth, the Cognito domain, callback URLs, or the extra auth flows without confirming actual frontend compatibility.

### 5.3 IAM execution roles

Three dedicated Lambda execution roles were created during P4-07.4d. Each is now attached to exactly one deployed function.

| Role | ARN | Managed policies | Inline policies |
| --- | --- | --- | --- |
| `structlab-dev-health-exec` | `arn:aws:iam::677339799150:role/structlab-dev-health-exec` | 0 | 0 |
| `structlab-dev-create-student-exec` | `arn:aws:iam::677339799150:role/structlab-dev-create-student-exec` | 0 | 1 |
| `structlab-dev-list-students-exec` | `arn:aws:iam::677339799150:role/structlab-dev-list-students-exec` | 0 | 1 |

All three roles use this trust policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "lambda.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

All three roles use these tags:

```text
Project=StructLab
Service=struct-lab-backend
Environment=dev
ManagedBy=Manual
```

#### `structlab-dev-create-student-exec`

Inline policy name: `structlab-dev-students-put-item`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:PutItem",
      "Resource": "arn:aws:dynamodb:eu-north-1:677339799150:table/StructLabStudents-dev"
    }
  ]
}
```

#### `structlab-dev-list-students-exec`

Inline policy name: `structlab-dev-students-scan`

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:Scan",
      "Resource": "arn:aws:dynamodb:eu-north-1:677339799150:table/StructLabStudents-dev"
    }
  ]
}
```

#### `structlab-dev-health-exec`

No managed or inline permission policy. The role exists only so Lambda can assume it.

#### IAM verification summary

- No wildcard actions or resources.
- No access to the old `Students` table.
- No Cognito permissions.
- No CloudWatch Logs permissions.
- Policy simulations: create-student `PutItem` and list-students `Scan` on the new table are allowed; all other tested DynamoDB operations, old-table access, and Cognito administrative operations are denied.
- `iam:PassRole` for the deployment identity to all three role ARNs, with `iam:PassedToService=lambda.amazonaws.com`, is allowed in policy simulation.

Policy simulations were performed during P4-07.4d. P4-07.5 then invoked four smoke tests; no DynamoDB read or write was observed, and no student data operation was performed.

## 6. Existing test resources — do not modify or delete without cleanup approval

| Resource | Verified state | Constraint |
| --- | --- | --- |
| Lambda `structlab-test` | `nodejs22.x`, handler `index.handler`, last modified `2026-11-24T18:13:27Z` | Test function; not one of the deployed backend functions |
| IAM role `structlab-test-execution-role` | ARN `arn:aws:iam::677339799150:role/structlab-test-execution-role`, created `2026-11-23T12:39:56+00:00` | Do not modify or reuse for the deployed functions |
| API Gateway HTTP API `tstq9li2el` | Routes `GET /health` and `GET /admin/test` | Test API; do not modify before P4-07.6 approval |
| DynamoDB table `Students` | ARN `arn:aws:dynamodb:eu-north-1:677339799150:table/Students`; `ACTIVE`; key `studentsId` (String); `5/5`; deletion protection enabled; 0 items | Legacy/test table; not the deployment target |
| Cognito group `structlab-test-teachers` | Exactly 1 member; no IAM role | Preserve the group and membership |
| Cognito confirmed test teacher | Single enabled, `CONFIRMED` user; username withheld | Do not reset, disable, or delete without approval |
| CloudWatch log group `/aws/lambda/structlab-test` | Pre-existing; no retention configured | Leave in place until cleanup approval |
| One unverified IAM user (name withheld) | Reported as unverified; ownership and use are not established | Do not modify, attach policies to, or delete until verified |

No test resource was modified during the IAM, documentation, or Lambda deployment stages.

## 7. Deployed Lambda functions and pending API Gateway

### 7.1 Lambda deployment — COMPLETE

**P4-07.5 status: LAMBDA DEPLOYMENT COMPLETE.**

All three functions were created during P4-07.5 with direct `aws lambda create-function` calls using `--zip-file fileb://...` from the local build output. No CloudFormation, CDK deployment, Docker, or S3 deployment bucket was used. Each function reached `Active`.

| Function | ARN | Execution role | Uploaded package |
| --- | --- | --- | --- |
| `structlab-dev-health` | `arn:aws:lambda:eu-north-1:677339799150:function:structlab-dev-health` | `structlab-dev-health-exec` | `dist/lambda/health.zip` |
| `structlab-dev-create-student` | `arn:aws:lambda:eu-north-1:677339799150:function:structlab-dev-create-student` | `structlab-dev-create-student-exec` | `dist/lambda/create-student.zip` |
| `structlab-dev-list-students` | `arn:aws:lambda:eu-north-1:677339799150:function:structlab-dev-list-students` | `structlab-dev-list-students-exec` | `dist/lambda/list-students.zip` |

Verified configuration for all three functions:

- runtime `nodejs22.x`;
- architecture `x86_64`;
- handler `index.handler`;
- package type `Zip`;
- memory `128 MB`;
- ephemeral storage `512 MB` (default);
- version `$LATEST` only; no published versions or aliases;
- tracing `PassThrough`;
- no layers, VPC configuration, reserved concurrency, or provisioned concurrency;
- no Function URL, resource policy, or event source mapping.

| Setting | `structlab-dev-health` | `structlab-dev-create-student` | `structlab-dev-list-students` |
| --- | --- | --- | --- |
| Timeout | 5 seconds | 10 seconds | 10 seconds |
| Environment variables | None | `STUDENTS_TABLE_NAME=StructLabStudents-dev` | `STUDENTS_TABLE_NAME=StructLabStudents-dev` |
| Execution role | `structlab-dev-health-exec` | `structlab-dev-create-student-exec` | `structlab-dev-list-students-exec` |
| State | `Active` | `Active` | `Active` |

Tags on all three functions:

```text
Project=StructLab
Service=struct-lab-backend
Environment=dev
ManagedBy=Manual
```

Uploaded artifacts and checksums:

| Function | Size (bytes) | SHA-256 (hex) | AWS CodeSha256 (Base64) |
| --- | --- | --- | --- |
| `structlab-dev-health` | `512` | `797983BC401D53B04B466465EB8BEA51105C999E43BFA6814B5ECA32CC9BDAE9` | `eXmDvEAdU7BLRmRl64vqURBcmZ5Dv6aBS17KMsyb2uk=` |
| `structlab-dev-create-student` | `160079` | `D4F44CD67559FE50982F952800E378CC20E771C3D1BB1C7F1ACA751C95C7E62C` | `1PRM1nVZ/lCYL5UoAON4zCDnccPRuxx/Gsp1HJXH5iw=` |
| `structlab-dev-list-students` | `160402` | `2C83459FBE271F7A2EF43D730C402A883F39B2AF390A091841A169B0076FE8DC` | `LINFn74nH3ou9D1zDEAqiD85sq85CgkYQaFpsAdv6Nw=` |

Each archive contains exactly one root entry, `index.js`. AWS `CodeSha256` and `CodeSize` matched the locally recorded values for all three functions.

### 7.2 Direct runtime smoke tests — PASSED

Four direct Lambda invocations were performed during P4-07.5 with sanitized API Gateway HTTP API v2 events. They did not go through API Gateway.

| Test | Function | Event | AWS status | `FunctionError` | Application status | Body |
| --- | --- | --- | --- | --- | --- | --- |
| Health | `structlab-dev-health` | `GET /health`, no headers | 200 | None | `200` | `{"status":"ok","service":"struct-lab-backend"}` |
| Unsupported content type | `structlab-dev-create-student` | `POST /students`, `content-type: text/plain` | 200 | None | `415` | `{"error":"Content-Type must be application/json"}` |
| Unauthenticated | `structlab-dev-list-students` | `GET /admin/students`, no authorizer context | 200 | None | `401` | `{"error":"Unauthorized"}` |
| Non-teacher claims | `structlab-dev-list-students` | `GET /admin/students`, synthetic access-token claims without `teachers` | 200 | None | `403` | `{"error":"Forbidden"}` |

Notes:

- No `FunctionError` occurred in any invocation.
- Node.js 22 runtime compatibility is **confirmed for these four tested paths only**.
- Test 4 passed synthetic authorizer claims directly to the handler, matching the repository unit-test pattern. No JWT was minted or validated, and no real teacher token was used.
- All rejection paths return before any DynamoDB operation by code inspection.
- No DynamoDB reads or writes were observed: the table showed zero consumed read and write capacity during the test window, and its item count remained `0`.
- No CloudWatch log group was created and no invocation log was returned; the execution roles have no CloudWatch Logs permissions.
- All existing test resources listed in section 6 remained unchanged.
- The AWS Free Plan remained `ACTIVE` with credits `$159.999971`.

### 7.3 API Gateway — PENDING

The existing test API `tstq9li2el` remains unchanged and currently has only:

- `GET /health`
- `GET /admin/test`

No backend route, JWT authorizer, CORS rule, throttling setting, stage change, or Lambda invoke permission has been configured.

Planned backend routes:

| Method | Path | Authorization | Planned Lambda |
| --- | --- | --- | --- |
| `GET` | `/health` | None | `structlab-dev-health` |
| `POST` | `/students` | None | `structlab-dev-create-student` |
| `GET` | `/admin/students` | Cognito JWT authorizer + `teachers` group check in the Lambda | `structlab-dev-list-students` |

Planned API settings from the CDK reference:

- JWT authorizer uses User Pool `eu-north-1_5v0nXILuU` and App Client `5abaa8u50uj7c4eii44goh2t2a`;
- identity source: `$request.header.Authorization`;
- CORS allowed origin: `http://localhost:3000` only;
- CORS methods: `GET`, `POST`;
- CORS headers: `content-type`, `authorization`;
- credentials: disabled;
- preflight max age: 300 seconds;
- default-stage throttling: rate 10 requests/second, burst 20.

API reuse/replacement decision: deferred to P4-07.6. Do not modify `tstq9li2el` before P4-07.6 approval. Lambda integration will require API Gateway invoke permissions on each function.

## 8. Packaging commands and deployed archives

From the repository root:

```powershell
pnpm package:lambdas
pnpm verify:lambdas
```

Deployed archives:

```text
dist/lambda/health.zip
dist/lambda/create-student.zip
dist/lambda/list-students.zip
```

These exact archives were uploaded during P4-07.5; sizes and checksums are recorded in section 7.1.

Each archive contains exactly one non-empty root entry, `index.js`. The packaging scripts refuse unexpected output paths and verify the archive shape.

If a local Node.js 22 binary is available, the stricter verification can be run with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-lambda-packages.ps1 -RequireNode22
```

Known packaging limitation: the local machine used for packaging has Node.js `v24.18.0`, and no local Node.js 22 binary was found. The bundles target `node22`. Deployed `nodejs22.x` execution succeeded for the four paths in section 7.2; all other runtime paths remain untested.

## 9. Remaining verification

### Backend

- Lambda functions are deployed and attached to the matching execution roles (section 7.1).
- After P4-07.6 API Gateway integration, verify through the API:
  - `GET /health` returns `200` with `status: ok` and service `struct-lab-backend`.
  - `POST /students` returns `201` for valid JSON, `415` for an unsupported content type, `413` for an oversized body, and `400` for invalid input.
  - `GET /admin/students` returns `401` without a token, `403` for a valid non-teacher token, and `200` with pagination for a teacher access token.
  - CORS preflight works for the allowed origin and no allow-origin header is returned for other origins.
  - Throttling behaves as configured under controlled dev-only load if separately approved.
- Do not use ID tokens for `/admin/students`; the handler requires an access token with the exact `teachers` group.

### Frontend

A local frontend repository was inspected read-only and contains no Cognito SDK, Amplify, SRP, Hosted UI, OAuth authorization-code, access-token, or ID-token implementation. Frontend Cognito compatibility is **NOT VERIFIED**.

Do not clone, modify, or deploy the frontend. OAuth, the Cognito domain, callback URLs, and the extra auth flow remain preserved until actual frontend compatibility is established.

### Authentication

No password-based SRP login was performed. No password, JWT, or fresh access-token claim was requested or verified. P4-07.5 exercised only synthetic non-teacher claims; real Cognito access tokens and teacher authorization remain **unverified**. Group membership alone does not prove end-to-end teacher authorization.

## 10. Cleanup candidates and unresolved decisions

### Cleanup candidates — separate approval required

| Candidate | Reason | Preconditions |
| --- | --- | --- |
| One unverified IAM user (name withheld) | Reported as unverified; ownership and use are unknown | Verify ownership and dependencies before any action |
| Lambda `structlab-test` | Test function | Remove only after the deployed backend functions replace its purpose |
| IAM role `structlab-test-execution-role` | Test execution role | Remove only after no function uses it |
| API Gateway `tstq9li2el` | Test API with `GET /health` and `GET /admin/test` | Remove only after the API integration is accepted in P4-07.6 |
| DynamoDB table `Students` | Legacy/test table with 0 items | Export/backup and explicit approval; deletion protection must be disabled separately |
| Cognito group `structlab-test-teachers` | Temporary group | Remove only after `teachers` membership is confirmed and no dependency remains |
| CloudWatch log group `/aws/lambda/structlab-test` | Test Lambda log group | Retain until its logs are no longer needed |

### Known limitations and unresolved decisions

- The three Lambda functions are deployed, but no API Gateway route, authorizer, CORS rule, throttling setting, or invoke permission is configured.
- No end-to-end API, CORS, throttling, or teacher-authorization verification has been performed.
- The IAM roles deliberately have no CloudWatch Logs permissions; function logs are unavailable until a later approved logging change.
- No CloudWatch log groups or alarms exist for the deployed functions.
- Node.js 22 compatibility is confirmed only for the four smoke-test paths in section 7.2. Valid registration, teacher-authorized listing, and pagination remain untested.
- Valid student registration and DynamoDB persistence are unverified.
- Teacher-authorized listing and pagination are unverified.
- Actual SRP login and fresh Cognito access-token claims are unverified; only synthetic non-teacher claims were exercised.
- Frontend Cognito compatibility is unverified.
- The live DynamoDB table was created manually and is not the CDK-managed table. Its name and provisioned capacity (`10` RCU / `10` WCU) differ from the CDK on-demand reference.
- Cognito password policy, password history, temporary password validity, account recovery, OAuth/domain, and extra auth flow differ from the CDK reference.
- The manual IAM roles use `ManagedBy=Manual`; CDK-tagged resources would use `ManagedBy=AWS CDK`.
- The `StructLab-Zero-Spend` budget is healthy, but whether credits are included in its calculation is unverified.
- Account-specific DynamoDB Free Tier usage remains unverified.
- The API reuse/replacement decision is deferred to P4-07.6.
- The backend is not production-ready. Lambda deployment is complete, but the API is not exposed and must not be treated as end-to-end deployed.

## 11. Exact next action

**P4-07.6 — API Gateway Configuration.**

1. Re-run repository and AWS preflight checks:

   ```powershell
   git rev-parse --abbrev-ref HEAD
   git rev-parse HEAD
   git status --short
   aws sts get-caller-identity --profile structlab-dev --region eu-north-1
   aws freetier get-account-plan-state --profile structlab-dev --region eu-north-1
   aws lambda get-function --function-name structlab-dev-health --profile structlab-dev --region eu-north-1
   ```

2. Decide whether to reuse `tstq9li2el` or create a separate HTTP API. This decision is intentionally deferred to P4-07.6.
3. Review the planned routes, JWT authorizer, CORS, throttling, and required Lambda invoke permissions in section 7.3.
4. Request explicit operator approval before any API Gateway mutation.
5. Configure API Gateway and verify route integration, authorizer behavior, CORS, and throttling as separately approved.
6. Do not modify or delete the existing test routes without cleanup approval.

Do not use real student data, real teacher tokens, or DynamoDB data operations during P4-07.6 without explicit approval.
