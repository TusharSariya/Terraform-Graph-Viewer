tofu plan -out=tfplan

tofu show -json tfplan > plan.json
tofu graph -plan=tfplan > graph.dot
tofu graph -plan=tfplan| dot -Tsvg > graph.svg

planned values -> root module -> child modules -> resources

tofu graph > graph.dot

python parse_dot.py graph.dot > graph.json

sudo apt install graphviz


resource changes

prior state


configuration -> edges


resource_changes -> nodes

configuration -> module calls -> lambda reader -> expressions -> (expr) -> refferences -> aws_sqs_queue.test_queue & var.attach_policy_statements

data.aws_iam_policy_document.additional_inline -> var.attach_policy_statements


dot file

"module.lambda-reader.var.attach_policy_statements": [
    "module.lambda-reader",
    "module.lambda-reader.var.attach_policy_statements"
  ],

  "module.lambda-reader.var.policy_statements": [
    "aws_s3_bucket.test",
    "aws_sqs_queue.test_queue",
    "module.lambda-reader",
    "module.lambda-reader.var.policy_statements"
  ],
  "module.lambda-reader.data.aws_iam_policy_document.additional_inline": [
    "module.lambda-reader.local.create_role",
    "module.lambda-reader.var.attach_policy_statements",
    "module.lambda-reader.var.policy_statements"
  ],
  "module.lambda-reader.data.aws_iam_policy_document.additional_inline[0]": [
    "module.lambda-reader.data.aws_iam_policy_document.additional_inline"
  ],
  "module.lambda-reader.aws_iam_role_policy.additional_inline": [
    "module.lambda-reader.aws_iam_role.lambda[0]",
    "module.lambda-reader.data.aws_iam_policy_document.additional_inline[0]",
    "module.lambda-reader.local.policy_name"
  ],
  "module.lambda-reader.aws_iam_role_policy.additional_inline[0]": [
    "module.lambda-reader.aws_iam_role_policy.additional_inline"
  ],
  "module.lambda-reader.aws_lambda_function.this": [
    "module.lambda-reader.aws_iam_role_policy.additional_inline[0]"
  ],
  "module.lambda-reader.aws_lambda_function.this[0]": [
    "module.lambda-reader.aws_lambda_function.this"
  ],
  "module.lambda-reader": [
    "module.lambda-reader.aws_lambda_function.this[0]"
  ],
  "root": [
    "module.lambda-reader",
    "module.lambda-writer",
    "provider[\\",
    "provider[\\",
    "provider[\\",
    "provider[\\"
  ]

  "aws_s3_bucket_object.test": [
    "aws_s3_bucket.test",
    "aws_s3_bucket_object.test"
  ],
  "aws_s3_bucket.test": [
    "provider[\\",
    "aws_s3_bucket.test"
  ],
  "provider[\\\"registry.opentofu.org/hashicorp/aws\\\"]": [
    "aws_s3_bucket_object.test",
    "module.lambda-reader.aws_lambda_function.this[0]",
    "module.lambda-writer.aws_lambda_function.this[0]"
  ],
  "root": [
    "module.lambda-reader",
    "module.lambda-writer",
    "provider[\\",
    "provider[\\",
    "provider[\\",
    "provider[\\"
  ]


curl -X POST http://localhost:8000/api/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What resources depend on the security group?"}'

watch -n 1 nvidia-smi

htop