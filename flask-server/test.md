# Terraform Plan Analysis: Issues and Recommendations

## \ud83d\udd34 Critical Issues

### 1. Missing SQS Event Source Mapping
There is no `aws_lambda_event_source_mapping` resource connecting the SQS queue to either Lambda function. The `lambda-reader` has the correct IAM permissions to consume from SQS (`sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:GetQueueAttributes`), but without an event source mapping, **the Lambda will never be triggered by SQS messages**. This is a fundamental wiring gap that renders the reader non-functional as an event-driven consumer.

### 2. Missing Environment Variables on Both Lambdas
Both `lambda-reader` and `lambda-writer` have `\"environment\": []` \u2014 no environment variables whatsoever. Neither function has a way to discover at runtime:
- The **S3 bucket name** (`test-20260204134234564900000001`)
- The **SQS queue URL**

The IAM policies correctly reference these resources, but the functions themselves have no runtime configuration to locate them. Unless the resource identifiers are hardcoded in the application code (which is poor practice), **both functions will fail at runtime**.

---

## \ud83d\udfe1 IAM Permission Gaps

### 3. Missing `s3:ListBucket` for lambda-reader
The reader has `s3:GetObject` but no `s3:ListBucket`. If the function needs to enumerate objects before reading them, it will receive a **403 Forbidden** on any ListObjects call. This is a common oversight.

### 4. Missing `s3:DeleteObject` for lambda-writer
The writer has `s3:PutObject` but not `s3:DeleteObject`. If the writer ever needs to overwrite or clean up objects, this permission is absent. Whether this is an issue depends on application logic, but it's worth verifying.

### 5. Unnecessary Bucket-Level ARN in Object Policies
Both inline policies grant permissions on both the bucket ARN and the `/*` (objects) ARN. For `s3:GetObject` and `s3:PutObject`, only the object-level ARN (`/*`) is needed. The bucket-level ARN is superfluous for these actions and should be removed for least-privilege adherence.

---

## \ud83d\udfe1 Configuration Concerns

### 6. Shared Deployment Artifact
Both `lambda-reader` and `lambda-writer` reference the **same zip file** and **same source code hash** (`builds/9c36e723854b07d30831934c1e09ec90731e68f335c47261ea580080b50210e8.zip`). If these functions are intended to have different logic (reader vs. writer), this is a misconfiguration. If intentional (e.g., a single binary with role-based behavior), it should be documented and the function would need an environment variable to distinguish its role \u2014 which is currently missing.

### 7. CloudWatch Log Retention Set to Infinite
`module.lambda-reader.aws_cloudwatch_log_group.lambda` has `retention_in_days: 0`, meaning logs are retained **forever**. This leads to unbounded storage costs. Set an explicit retention period (e.g., 30, 90, or 365 days).

### 8. Hardcoded Values That Should Be Dynamic
- **AWS Account ID** (`992382747916`) is hardcoded in the SQS queue ARN within IAM policies \u2014 should use `data.aws_caller_identity.current.account_id`.
- **Region** (`us-east-1`) appears hardcoded \u2014 should reference `data.aws_region.current.name` or a variable.
- **S3 bucket name** with a timestamp-based suffix is hardcoded in policies rather than interpolated from the bucket resource.

---

## \u2705 What's Working Correctly

| Area | Status |
|------|--------|
| Terraform syntax and resource references | No errors detected |
| IAM trust policies (`sts:AssumeRole` for `lambda.amazonaws.com`) | Correct |
| Read/write IAM separation (reader gets `GetObject`, writer gets `PutObject`) | Clean |
| SQS IAM separation (reader gets consume permissions, writer gets `SendMessage`) | Correct |
| Networking | Valid \u2014 both Lambdas run outside VPC, accessing S3/SQS via public endpoints |
| CloudWatch logging policies | Present for both functions |

---

## Summary of Required Fixes

| Priority | Issue | Fix |
|----------|-------|-----|
| \ud83d\udd34 Critical | No SQS \u2192 Lambda event source mapping | Add `aws_lambda_event_source_mapping` for `lambda-reader` |
| \ud83d\udd34 Critical | No environment variables on either Lambda | Pass S3 bucket name and SQS queue URL as env vars |
| \ud83d\udfe1 Medium | Missing `s3:ListBucket` on reader | Add to IAM policy if needed by application |
| \ud83d\udfe1 Medium | Infinite log retention | Set `retention_in_days` to a finite value |
| \ud83d\udfe1 Medium | Hardcoded account ID and region in policies | Use dynamic references |
| \ud83d\udfe1 Low | Same code artifact for both functions | Verify this is intentional; add distinguishing env var if so |",
    "question": "Are there any bugs or issues in this Terraform plan? Analyze each resource. Check for missing event source mappings, IAM gaps, networking issues, and configuration problems.