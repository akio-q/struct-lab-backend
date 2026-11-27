# Manual AWS Deployment Runbook and Team Handoff

- **Checkpoint:** P4-07.7.5b — COMPLETE
- **Last updated:** 2026-11-27
- **Repository:** <https://github.com/akio-q/struct-lab-backend>
- **Branch:** `feat/manual-aws-deployment`
- **Packaging commit:** `7b7f9317ec7eec9ff0fb9f4cc58d97221086f87c`
- **P4-07.6 checkpoint base commit:** `0eec989c5704d35528790c611691fb3af5a0f3c6`
- **Documentation base commit:** `d1d561faa818fb71d527147db8d50c87c8555547`
- **Deployment state:** Manual AWS deployment complete. Functional live E2E verification is 9/9 PASS. E2E-10 safe cleanup is DEFERRED BY OPERATOR; two synthetic students and one synthetic non-teacher are retained for frontend integration. Frontend integration is PENDING.
- **Next action:** P4-08 — Final Review, Commit, Pull Request and Merge (separate approval required; not performed here).

> Every AWS mutation requires explicit operator approval. This repository is public: keep credentials, passwords, tokens, OAuth authorization codes, real student data, user sign-in details, personal identifiers, and local filesystem paths out of it. The student records in section 10 are synthetic fixtures.

> **This checkpoint is documentation-only.** No AWS API or CLI request, deployed HTTP request, Cognito authentication, student deletion, Cognito deletion, or infrastructure change was performed during P4-07.7.5b.

### Evidence classification

| Class | Meaning in this document |
| --- | --- |
| **Deployment record** | Resource settings, package hashes and route bindings recorded during P4-07.4–P4-07.6 (sections 5–8). |
| **Live verified** | Accepted results from registration, persistence, Cognito sign-in and requests to the deployed API (section 9). |
| **Manually observed** | The operator inspected the retained records in the AWS Console (section 10). This was not a new, independent DynamoDB API check. |
| **Locally tested** | Verified by repository tests, local packaging, or offline tooling. No AWS call is implied. |
| **CDK reference only** | Defined in `lib/` or `test/` but not deployed. Do not treat it as live state. |
| **Deferred / unverified** | Not executed or not independently confirmed. See section 11. |

## 1. Deployment approach

### Why direct AWS CLI instead of CDK deployment

The P4-07 phase required real AWS resources without using CloudFormation, CDK deployment, or Docker. Direct AWS CLI deployment was chosen so that:

- each resource creation or update is visible as an individual command;
- each mutation can be approved and verified separately;
- no `cdk bootstrap`, `cdk deploy`, or CloudFormation stack state is introduced in this phase;
- failures can be stopped and reported without an automatic stack rollback or broad permission change.

AWS Free Plan restrictions on CloudFormation stack creation led to the manual deployment. The team reused the existing HTTP API and Cognito configuration, created the backend table, roles and functions, and connected the routes. No CloudFormation stack owns these resources.

The existing CDK code remains the reference design. It was not modified and is not the deployed state:

- `lib/struct-lab-stack.ts` — intended Lambda, API Gateway, Cognito, DynamoDB, logging, and alarm configuration;
- `lib/environments.ts` — pinned dev account and region;
- `bin/app.ts` — stack wiring and environment validation;
- `test/` — infrastructure and runtime regression coverage.

No `cdk bootstrap`, `cdk diff`, `cdk deploy`, or `cdk destroy` was run for the manual deployment. The [frontend integration guide](frontend-integration.md) uses the deployed URL and Cognito IDs directly.

### Approval model

- The operational commands below are for separately authorized work. P4-07.7.5b uses only existing evidence, including for read-only checks.
- All create, update, and delete operations require explicit operator approval.
- Do not silently switch AWS profiles or regions.
- Do not broaden permissions or delete partially created resources to recover from a failure. Stop and report the partial state.

## 2. Repository checkpoint

| Item | Value |
| --- | --- |
| Remote | `https://github.com/akio-q/struct-lab-backend.git` |
| Branch | `feat/manual-aws-deployment` |
| Packaging commit | `7b7f9317ec7eec9ff0fb9f4cc58d97221086f87c` — `feat(deployment): add local Lambda packaging and verification` |
| Health hotfix and regression assertion | `66d7a4cb453bdacc68e93c0a81c88cb72dade2ae` |
| Lambda deployment commit | None — P4-07.5 changed AWS resources only; no repository change |
| Last full regression | 247/247 PASS across 12 files, including 28 infrastructure tests — historical accepted result from P4-07.6; not rerun for P4-07.7.5b |
| Final functional live E2E | E2E-01–E2E-09 PASS; E2E-10 DEFERRED BY OPERATOR (P4-07.7) |
| Package manager | `pnpm@11.14.0` |
| Required Node.js | `>=22` |
| Local Node.js used for checkpoint packaging | `v24.13.1` |

This checkpoint does not create or push a commit. A separate, explicitly approved
P4-08 review may commit this document and push it to the existing remote feature
branch without force.

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
| Plan status | `ACTIVE` — last audited during P4-07.6; not re-verified in P4-07.7.5b |
| Remaining credits | `$159.999971` — last reported during P4-07.5; current balance not verified |
| Plan expiration | `2027-05-12` |
| Budget | `StructLab-Zero-Spend` |
| Budget amount | `$1.00` monthly |
| Amount used at verification | `$0.00` — historical observation; not current billing |
| Budget health | `Healthy` — historical observation |
| Budget alert threshold | Actual cost > `$0.01` |
| Budget alert recipient email | Verified (address not stored) |
| Credits in budget calculation | Unverified |
| Account-specific DynamoDB Free Tier usage | Unverified |

No billing, Free Plan, credits, or budget audit was performed during P4-07.7.5b. The values above are historical observations. Do not infer zero cost or unchanged credits from this table.

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
| P4-07.6 — API Gateway Configuration | Completed — configuration audit and HTTP smoke tests passed |
| P4-07.7 — Backend End-to-End Verification | **COMPLETE** — 9/9 functional live scenarios PASS |
| P4-07.7.5a — Safe Cleanup | **DEFERRED BY OPERATOR** — Console reconciliation recorded; no deletion |
| P4-07.7.5b — Final Deployment Documentation | **COMPLETE** — this document |
| P4-08 — Final Review, Commit, Pull Request and Merge | **NEXT** — separate approval required |
| Cognito JWT and real teacher authorization verification | Completed — E2E-03, E2E-04, E2E-05 |
| Valid student registration and DynamoDB persistence verification | Completed — E2E-01, E2E-02 |
| Teacher-authorized listing and pagination verification | Completed — E2E-07, E2E-08 |
| Input validation verification | Completed — E2E-09, 18/18 cases |
| Frontend integration verification | Pending |
| Test-resource cleanup | Deferred by operator; retained synthetic resources remain |

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
| Items at last manual verification | `2` synthetic records (P4-07.7.5a Console scan; retained for frontend integration) |

No DynamoDB data operation was performed during the IAM, documentation, or Lambda deployment stages. After registration validation, the operator performed a manual Console reconciliation that observed 2 items and 2 scanned items, with no additional result pages observed; both records matched the registration manifest. No item was edited or deleted. See section 10.

### 5.2 Cognito

| Property | Verified value |
| --- | --- |
| User Pool ID | `eu-north-1_5v0nXILuU` |
| User Pool name | `User pool - nobwzm` |
| Username attributes | `email` (live `UsernameAttributes=[email]`) |
| Sign-in identifier | `email`; teachers sign in with their email address |
| Feature plan | `ESSENTIALS` |
| Deletion protection | `ACTIVE` |
| Self-registration | Disabled (`AllowAdminCreateUserOnly=true`) |
| MFA | `OFF` |
| Account recovery | `verified_email`, `verified_phone_number` |
| Cognito domain | `eu-north-15v0nxiluu` |
| User inventory | Earlier inventory estimated `1` user. Later E2E used the existing teacher and one synthetic non-teacher; the pool was not recounted. |
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
| Explicit `DefaultRedirectURI` setting | Not set; the allowed callback above leads to the default Managed Login landing page |
| Supported identity providers | `COGNITO` |
| `teachers` group | Exact case-sensitive name, no IAM role. The deployment audit found one confirmed test teacher. |
| `structlab-test-teachers` group | The same audit found the same member and no IAM role. This group does not grant StructLab teacher access. |

The teacher identity is intentionally withheld. E2E-04 verified a live teacher access token, E2E-05 rejected a teacher ID token, and E2E-06 rejected a valid non-teacher access token. Group membership alone is not treated as proof of end-to-end authorization.

Cognito state was not re-audited during P4-07.7.5b. The values above are from earlier deployment verification and the live E2E runs. The live pool has a Cognito domain and OAuth code flow with callback `https://d84l1y8p4kdic.cloudfront.net`; that callback is Cognito Managed Login's existing default redirect page, not the StructLab frontend. A successful Managed Login screenshot proves Cognito authentication only; it does not prove frontend integration.

#### Cognito security mismatches left unchanged

The manual deployment retained these settings. Changes require separate approval; the frontend should use the deployed values.

| Setting | CDK reference | Live configuration |
| --- | --- | --- |
| Sign-in identifier | Username; no email sign-in attribute configured | Email (`UsernameAttributes=[email]`) |
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
| HTTP API `tstq9li2el` | Now the active dev API (section 7.3); `GET /admin/test` retained | Preserve the API, original test integrations, authorizer, and test Lambda permissions |
| DynamoDB table `Students` | ARN `arn:aws:dynamodb:eu-north-1:677339799150:table/Students`; `ACTIVE`; key `studentsId` (String); `5/5`; deletion protection enabled; 0 items | Legacy/test table; not the deployment target |
| Cognito group `structlab-test-teachers` | Exactly 1 member; no IAM role | Preserve the group and membership |
| Cognito confirmed test teacher | Single enabled, `CONFIRMED` user; username withheld | Do not reset, disable, or delete without approval |
| CloudWatch log group `/aws/lambda/structlab-test` | Pre-existing; no retention configured | Leave in place until cleanup approval |
| One unverified IAM user (name withheld) | Reported as unverified; ownership and use are not established | Do not modify, attach policies to, or delete until verified |

No test resource was modified during the IAM, documentation, or Lambda deployment stages. The retained synthetic students and non-teacher are described in section 10.

## 7. Deployed Lambda functions and HTTP API

### 7.1 Lambda deployment — COMPLETE

**P4-07.5 status: LAMBDA DEPLOYMENT COMPLETE.**

All three functions were created during P4-07.5 with direct `aws lambda create-function` calls using `--zip-file fileb://...` from the local build output. No CloudFormation, CDK deployment, Docker, or S3 deployment bucket was used. Each function reached `Active`.

| Function | ARN | Execution role | Original P4-07.5 package |
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
- no Function URL or event source mapping; each backend function now has one route-specific invoke permission (section 7.3).

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
| `structlab-dev-health` | `530` | `7593C1823D86170B6E413DE31416AA18050B784C812919A2EC00149B6EC2E42F` | `dZPBgj2GFwtuQT3jFBaqGAULeEyBKRmi7AAUm27C5C8=` |
| `structlab-dev-create-student` | `160079` | `D4F44CD67559FE50982F952800E378CC20E771C3D1BB1C7F1ACA751C95C7E62C` | `1PRM1nVZ/lCYL5UoAON4zCDnccPRuxx/Gsp1HJXH5iw=` |
| `structlab-dev-list-students` | `160402` | `2C83459FBE271F7A2EF43D730C402A883F39B2AF390A091841A169B0076FE8DC` | `LINFn74nH3ou9D1zDEAqiD85sq85CgkYQaFpsAdv6Nw=` |

Each archive contains exactly one root entry, `index.js`. The health row identifies the P4-07.6 release ZIP; the other two deployed hashes are unchanged from P4-07.5. The audit verified the deployed health size and hash against the preserved release ZIP.

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
- These four direct paths were exercised on Node.js 22 during P4-07.5.
- Test 4 passed synthetic authorizer claims directly to the handler, matching the repository unit-test pattern. No JWT was minted or validated, and no real teacher token was used.
- All rejection paths return before any DynamoDB operation by code inspection.
- No DynamoDB reads or writes were observed: the table showed zero consumed read and write capacity during the test window, and its item count remained `0`.
- No CloudWatch log group was created and no invocation log was returned; the execution roles have no CloudWatch Logs permissions.
- All existing test resources listed in section 6 remained unchanged.
- At the time of P4-07.5, the AWS Free Plan was reported `ACTIVE` with credits `$159.999971`; this is historical and was not re-audited.

### 7.3 API Gateway — COMPLETE

Reused HTTP API `tstq9li2el` at `https://tstq9li2el.execute-api.eu-north-1.amazonaws.com`. The `$default` stage has `AutoDeploy=true`; automatic deployment `4mpp9h` reached `DEPLOYED`. Default throttling is 10 requests/second, burst 20, with no route overrides. API-wide CORS permits only `http://localhost:3000`, methods `GET, POST`, headers `content-type, authorization`, credentials disabled, max age 300 seconds. Both settings also apply to the test route. Final live E2E verification (section 9) used this API; all nine functional scenarios passed.

| Route | Route ID | Authorization | Integration ID | Lambda |
| --- | --- | --- | --- | --- |
| `GET /health` | `hf81nj3` | None | `l8x59n6` | `structlab-dev-health` |
| `POST /students` | `2v7xkv0` | None | `176zggg` | `structlab-dev-create-student` |
| `GET /admin/students` | `9fe7qf9` | JWT `5nmism` | `0p1bvlm` | `structlab-dev-list-students` |
| `GET /admin/test` | `dkrm60b` | JWT `5nmism` | `v4mv4s5` (preserved) | `structlab-test` |
| No current route (original health target) | — | — | `i1dl8gu` (preserved) | `structlab-test` |

All five integrations are `AWS_PROXY`, integration method `POST`, payload `2.0`, timeout 30,000 ms. Reused JWT authorizer `5nmism` validates the Cognito pool issuer for `eu-north-1_5v0nXILuU`, audience `5abaa8u50uj7c4eii44goh2t2a`, via `$request.header.Authorization`.

Each backend Lambda policy grants `Allow` for `lambda:InvokeFunction` to `apigateway.amazonaws.com` on that function alone, with `AWS:SourceAccount=677339799150` and the following literal `AWS:SourceArn`. The original test Lambda policies were preserved.

| Function | Statement ID | Source ARN |
| --- | --- | --- |
| `structlab-dev-health` | `apigw-get-health` | `arn:aws:execute-api:eu-north-1:677339799150:tstq9li2el/$default/GET/health` |
| `structlab-dev-create-student` | `apigw-post-students` | `arn:aws:execute-api:eu-north-1:677339799150:tstq9li2el/$default/POST/students` |
| `structlab-dev-list-students` | `apigw-get-admin-students` | `arn:aws:execute-api:eu-north-1:677339799150:tstq9li2el/$default/GET/admin/students` |

### 7.4 HTTP smoke evidence and health hotfix

Original S1 returned the correct `200` JSON body but omitted `Cache-Control`. The health handler built its own headers. A separately approved one-line fix added `cache-control: no-store` without changing status, content type, or body; only health code was redeployed. The existing health unit test now also asserts `no-store` (commit in section 2).

After the hotfix, **11/11 HTTP scenarios passed in 12 requests**, all with curl exit 0. S1 passed separately and again in the full run.

| Scenarios | Accepted result |
| --- | --- |
| S1–S2: health, then allowed origin | `200`, expected JSON; S1 confirmed `no-store`, S2 confirmed allow-origin |
| S3–S4: both admin routes without credentials | `401 Unauthorized` |
| S5–S7: unsupported content type, malformed JSON, empty object | `415`, `400`, `400`; rejected before persistence |
| S8–S9: allowed preflights for registration and admin listing | `204` with configured CORS headers |
| S10: invalid JWT | `401 Unauthorized` |
| S11: disallowed-origin preflight | `204`, no allow-origin header |

These 11/11 results are the historical P4-07.6 smoke baseline. They are superseded by section 9 for functional coverage.

### 7.5 API rollback — separate approval required

Retain the rollback snapshots. Before acting, verify the account, region, API, IDs, current targets and policy statements against section 7.3; stop on drift or failure.

1. Delete only the new routes `2v7xkv0` and `9fe7qf9`. Restore route `hf81nj3` to `integrations/i1dl8gu`, authorization `NONE`.
2. Remove only the three named backend permission statements above. Delete only the now-unreferenced integrations `l8x59n6`, `176zggg`, and `0p1bvlm`.
3. Remove the added CORS configuration with `apigatewayv2 delete-cors-configuration`. Preserve both original integrations, `GET /admin/test`, the test Lambda permissions, API, stage and authorizer.
4. Re-read routes, integrations, policies, CORS and stage settings against the pre-change snapshots. Confirm each backend function exists before accepting `ResourceNotFoundException` from `get-policy` as absence. Exact restoration of previously unset throttle fields was not confirmed: **retain 10/20**; do not assume omission resets them or recreate the stage. API rollback does not revert Lambda code.

## 8. Packaging commands and deployed archives

From the repository root:

```powershell
pnpm package:lambdas
pnpm verify:lambdas
```

Local build outputs:

```text
dist/lambda/health.zip
dist/lambda/create-student.zip
dist/lambda/list-students.zip
```

These are rebuilds, not deployment records. ZIP timestamps can change hashes. At the P4-07.6 checkpoint, `typecheck`, `lint`, `test`, `build`, `package:lambdas`, `verify:lambdas` and `git diff --check` passed. The verifier checked all three ZIPs and handler exports, its network guard, and four offline smoke tests. No rebuild was uploaded. The original health release ZIP was retained outside the repository and its SHA-256 matched section 7.1 before and after packaging.

Each archive contains exactly one non-empty root entry, `index.js`. The packaging scripts refuse unexpected output paths and verify the archive shape.

If a local Node.js 22 binary is available, the stricter verification can be run with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-lambda-packages.ps1 -RequireNode22
```

Known packaging limitation: the checkpoint verifier used Node.js `v24.13.1`; no local Node.js 22 binary was found. Bundles target `node22`. For deployed runtime evidence see sections 7.2 and 7.4.

## 9. Final live end-to-end verification — COMPLETE

P4-07.7 exercised the deployed API and real Cognito authentication. The preserved registration manifest records HTTP `201` and verified persistence for both student IDs. Section 10 records the later Console reconciliation. Neither an HTTP status nor a matching error body identifies the component that produced it.

### 9.1 Scenario results

| Scenario | Accepted result |
| --- | --- |
| E2E-01 — Student registration | **PASS** |
| E2E-02 — DynamoDB persistence | **PASS** |
| E2E-03 — Real Cognito authentication | **PASS** |
| E2E-04 — Teacher access-token authorization | **PASS** |
| E2E-05 — Teacher ID-token rejection | **PASS** |
| E2E-06 — Non-teacher access-token rejection | **PASS** |
| E2E-07 — Student listing | **PASS** |
| E2E-08 — Pagination | **PASS** |
| E2E-09 — Input validation | **PASS** |
| E2E-10 — Safe cleanup | **DEFERRED BY OPERATOR** |

Final classification:

- Functional live E2E scenarios: **9/9 PASS**.
- Original E2E checklist: **9 PASS, 1 DEFERRED**.
- Cleanup is **not PASS** and was **not executed**.

### 9.2 Accepted verification totals

| Verification | Accepted result | Classification |
| --- | ---: | --- |
| Backend tests | **247/247 PASS** | Historical accepted baseline across 12 files; not rerun for P4-07.7.5b |
| Infrastructure tests | **28/28 PASS** | Included in the 247 backend total; not a separate total |
| Offline package smoke tests | **4/4 PASS** | Historical local packaging verification |
| Initial live HTTP smoke tests | **11/11 PASS** | Historical P4-07.6 baseline, 12 requests |
| Combined Python offline E2E tests | **156/156 PASS** | Historical offline baseline |
| Focused registration and validation tests | **53/53 PASS** | Subset of the backend total |
| Protected query validation | **8/8 PASS** | Live `GET /admin/students` with teacher authorization |
| Registration input validation | **10/10 PASS** | Live `POST /students`; all ten invalid requests rejected |
| Combined validation cases | **18/18 PASS** | 8 protected query + 10 registration; not added to other totals |
| Functional live E2E scenarios | **9/9 PASS** | P4-07.7 |

All results above were accepted before P4-07.7.5b; none of these tests was rerun here. The infrastructure and focused suites overlap the backend total. The 18 validation cases comprise the 8 query and 10 registration cases, so there is no grand total.

### 9.3 Authorization behavior

| Request to `GET /admin/students` | Observed HTTP status |
| --- | ---: |
| Protected request without a token | **401** |
| Teacher access token | **200** |
| Teacher ID token | **401** |
| Valid non-teacher access token | **403** |

Actual E2E-06 output:

```text
RESULT PASS
E2E-06 PASS
HTTP_STATUS 403
LAYER HANDLER_COMPATIBLE
AUTH_ATTEMPTS 1
HTTP_GETS 1
DETAIL none
```

`LAYER HANDLER_COMPATIBLE` means the observed response matches the handler contract. It is not independent proof of the execution layer.

The E2E helper decodes JWT claims locally to prepare and inspect test requests. Local claim decoding is **not** independent cryptographic signature verification. API Gateway's JWT authorizer is the signature, issuer, and audience enforcement point; the Lambda teacher guard additionally requires `token_use === "access"` and the exact case-sensitive group `teachers`.

### 9.4 Registration contract and live validation

`POST /students` is public. It creates a DynamoDB record, not a Cognito account. The [handler](../src/handlers/create-student.ts), [HTTP helpers](../src/lib/http.ts) and [validator](../src/students/validation.ts) define this contract.

| Rule | Actual behavior |
| --- | --- |
| Content-Type | `application/json`; optional parameters such as `charset` are accepted; media type and header name are case-insensitive |
| Maximum body size | **4096** decoded UTF-8 bytes |
| Body presence | Required; blank body is rejected |
| JSON shape | Must parse as a JSON object |
| `fullName` | String; trimmed; 1–200 characters |
| `group` | String; trimmed; 1–50 characters |
| Unknown fields | Ignored, but counted toward the 4096-byte body limit |
| Successful registration | **201** with `studentId` (server-generated UUID v4), trimmed `fullName` and `group`, and `createdAt` (server-generated ISO 8601 timestamp) |
| Invalid input | **400** |
| Oversized body | **413** |
| Unsupported media type | **415** |

The handler checks media type first, then decoded bytes, then JSON and fields. Field lengths use JavaScript string length (UTF-16 code units) after `trim()`. Only valid input reaches `PutItem`; the handler returns `201` after the write succeeds. A repository failure returns `500` with `Internal server error`.

Handler error responses use:

```json
{"error":"<message>"}
```

with `content-type: application/json` and `cache-control: no-store`.

Exact messages:

| Status | Message |
| ---: | --- |
| 415 | `Content-Type must be application/json` |
| 413 | `Request body must be at most 4096 bytes` |
| 400 | `Request body is required` |
| 400 | `Request body must be valid JSON` |
| 400 | `Request body must be a JSON object` |
| 400 | `fullName must be a non-empty string` |
| 400 | `fullName must be at most 200 characters` |
| 400 | `group must be a non-empty string` |
| 400 | `group must be at most 50 characters` |

Live validation results:

- Eight HTTP **400** cases: PASS.
- One HTTP **415** case: PASS.
- One HTTP **413** case: PASS.
- Exact error bodies: PASS.
- Total POST attempts: **10**.
- Unexpected results: **0**.
- Ambiguous results: **0**.
- Successful registration responses: **0**.

Registration is **not idempotent**. The frontend must not blindly retry an ambiguous registration request after a timeout, `429`, `500`, or network failure; a retry can create a duplicate record.

### 9.5 Listing contract

Send `Authorization: Bearer <access-token>` to `GET /admin/students`. The [teacher guard](../src/lib/auth.ts) requires an access token with the exact case-sensitive group `teachers` before the [listing handler](../src/handlers/list-students.ts) validates query parameters or calls DynamoDB.

- Response shape: `{ "items": Student[], "nextCursor": string | null }`.
- Each item contains exactly `studentId`, `fullName`, `group`, and `createdAt`.
- Default `limit`: **20**.
- Maximum `limit`: **100**.
- `limit` must be a decimal integer from 1 to 100; otherwise **400** with `limit must be an integer between 1 and 100`.
- Empty `cursor`: **400** with `cursor must not be empty`.
- Invalid or oversized `cursor`: **400** with `cursor is invalid`.
- Maximum cursor length: **512** characters.
- [Cursor format](../src/students/cursor.ts): unpadded base64url-encoded JSON object containing only `studentId`, whose value must be a UUID v4. The cursor is opaque to clients: pass it back unchanged as `cursor`.
- Backend uses DynamoDB `Scan`; no stable sort order is promised.
- `nextCursor: null` means there are no more pages.
- Pagination may produce an empty terminal page; continue while `nextCursor` is non-null.

E2E-07 (listing) and E2E-08 (pagination) passed.

## 10. Deferred cleanup and retained test data

### 10.1 Operator decision

E2E-10 safe cleanup is **DEFERRED BY OPERATOR**. This is an explicit operator decision, not a technical blocker. No deletion was executed. Deletion permissions and deletion behavior remain unverified.

### 10.2 Manual Console reconciliation

After registration validation, the operator performed a manual AWS Console reconciliation. This was a manual observation, not an independent DynamoDB API check.

| Observation | Result |
| --- | --- |
| Table | `StructLabStudents-dev` |
| Items returned | **2** |
| Items scanned | **2** |
| Additional result pages | None observed |
| RCUs consumed | **0.5** |
| Record inspection | Both records were individually opened; all four attributes matched the registration manifest |
| Unexpected records | None observed |
| Records edited or deleted | None |

The Console displayed the scan time as **November 27, 2026, 01:30:49**. No timezone or read-consistency setting is established by the screenshot; do not infer one.

### 10.3 Retained synthetic students

Both records are intentionally retained for upcoming frontend integration. Their values are recorded in the preserved `registration-manifest-SL_E2E_20261125_56bd0fa0e60a.json`.

| Field | Student 01 | Student 02 |
| --- | --- | --- |
| `studentId` | `ca461ea9-497a-40ee-aa66-d00fb7d8785b` | `48dc69fa-1b24-4544-b1a1-4d267e1dd44e` |
| `fullName` | `SL_E2E_20261125_56bd0fa0e60a_01` | `SL_E2E_20261125_56bd0fa0e60a_02` |
| `group` | `SL_E2E_20261125_56bd0fa0e60a` | `SL_E2E_20261125_56bd0fa0e60a` |
| `createdAt` | `2026-11-26T18:44:35.766Z` | `2026-11-26T18:44:47.566Z` |

### 10.4 Retained synthetic non-teacher

The operator retained one synthetic non-teacher for potential frontend authorization verification. Its exact sign-in email, canonical Cognito username and `sub` are recorded in the private `nonteacher-manifest-SL_E2E_20261125_56bd0fa0e60a.json`.

| Property | Previously observed value |
| --- | --- |
| Status | Enabled; `CONFIRMED` |
| Email verified | Administratively verified |
| Group memberships | None |
| Managed Login | Successful |
| Live E2E-06 rejection | **PASS** — `403` |

The existing teacher was not modified. No deletion was executed. Retention is based on the earlier verification and the decision not to delete; Cognito state was not independently reverified during cleanup or this documentation checkpoint.

### 10.5 Future cleanup instructions

Future cleanup requires separate explicit approval and must remove only explicitly approved synthetic resources.

1. Verify the AWS account, region, table, and resource identifiers before acting.
2. Match the approved student IDs to the registration manifest. For any approved Cognito removal, match the pool, canonical username, `sub` and email to the non-teacher manifest. Stop on a mismatch.
3. Preserve the existing teacher identity and the `teachers` group membership.
4. Export or back up any data that must be retained before a destructive operation.
5. Delete only the approved items or users. Do not delete the table, the User Pool, the App Client, or the `teachers` group as part of routine test-data cleanup.
6. Do not use a broad scan-and-delete procedure; deletion protection on the table and User Pool is a separate safeguard and is not a substitute for item-level approval.
7. Recheck the remaining resources and record the result without storing passwords, tokens, or other secrets.
8. Treat deletion permissions and behavior as unverified until an approved cleanup actually exercises them.

## 11. Remaining limitations, cleanup candidates and unresolved decisions

### 11.1 Limitations

- Safe cleanup (E2E-10) is deferred; deletion permissions and behavior remain unverified.
- Frontend integration is pending. The earlier read-only inspection found no Cognito SDK, Amplify, SRP, Hosted UI, OAuth authorization-code, access-token, or ID-token implementation in the local frontend repository. Re-verify before integration.
- Cognito Managed Login's existing default redirect page is not the StructLab frontend. A successful Managed Login screenshot proves Cognito authentication only.
- Runtime throttling (`429`) and Lambda-throttling `500` behavior were not load-tested; a controlled dev-only test requires separate approval.
- CORS headers on gateway-generated `401`, `403`, `429`, and `500` responses were not independently verified.
- The manually deployed Lambda execution roles have no CloudWatch Logs permissions; function logs are unavailable. The three log groups and four alarms in the CDK design were not deployed.
- The manual DynamoDB table uses provisioned capacity (`10` RCU / `10` WCU), while the CDK reference uses on-demand throughput (`25`/`25`).
- The manual Cognito configuration differs from the CDK reference in password policy, password history, temporary password validity, account recovery, OAuth/domain, and the extra `ALLOW_USER_AUTH` flow.
- The manual IAM roles use `ManagedBy=Manual`; CDK-tagged resources would use `ManagedBy=AWS CDK`.
- PITR, AWS Backup, DynamoDB TTL, and automated retention are not configured. The retention policy remains manual.
- Dev is not approved for real personal data; use synthetic data only. Any new live registration or data operation requires separate approval.
- Public registration can be abused by non-browser clients. CORS is not authorization, and best-effort throttling is not a spending cap.
- The AWS Free Plan was last audited as `ACTIVE`; current billing, credits, and Free Plan status were not re-verified. Do not claim zero cost or unchanged credits.
- `docs/deployment.md`, `docs/phase-2-plan.md`, and `docs/phase-3-plan.md` still describe the pre-deployment state. They were outside the approved edit set for P4-07.7.5b and need a separate documentation update.

### 11.2 Cleanup candidates — separate approval required

| Candidate | Reason | Preconditions |
| --- | --- | --- |
| One unverified IAM user (name withheld) | Reported as unverified; ownership and use are unknown | Verify ownership and dependencies before any action |
| Lambda `structlab-test` | Test function | Remove only after the deployed backend functions replace its purpose |
| IAM role `structlab-test-execution-role` | Test execution role | Remove only after no function uses it |
| DynamoDB table `Students` | Legacy/test table with 0 items | Export/backup and explicit approval; deletion protection must be disabled separately |
| Cognito group `structlab-test-teachers` | Temporary group | Remove only after `teachers` membership is confirmed and no dependency remains |
| CloudWatch log group `/aws/lambda/structlab-test` | Test Lambda log group | Retain until its logs are no longer needed |
| Two synthetic students and one synthetic non-teacher | Retained for frontend integration | Follow the [dev retention policy](../README.md#retention-policy) and the manifest-scoped approval procedure in section 10.5 |

## 12. Exact next action

**P4-08 — Final Review, Commit, Pull Request and Merge.** Wait for separate approval. Preserve the release ZIP, rollback snapshots, manifests and retained synthetic test data. Safe cleanup remains deferred.
