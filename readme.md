tofu plan -out=tfplan

tofu show -json tfplan > plan.json

planned values -> root module -> child modules -> resources

resource changes

prior state


configuration -> edges


resource_changes -> nodes

configuration -> module calls -> lambda reader -> expressions -> (expr) -> refferences -> aws_sqs_queue.test_queue & var.attach_policy_statements

data.aws_iam_policy_document.additional_inline -> var.attach_policy_statements

