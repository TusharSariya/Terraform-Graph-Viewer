/*module "lambda" {
  source        = "terraform-aws-modules/lambda/aws"
  version       = "8.4.0"
  function_name = "test"
  handler       = "index.handler"
  runtime       = "python3.13"
  source_path   = "."
}*/

resource "aws_s3_bucket" "test" {
  bucket_prefix = "test-"
}

resource "aws_s3_bucket_object" "test" {
  bucket = aws_s3_bucket.test.id
  key    = "test"
  source = "./test.txt"
}

# SQS Queue
resource "aws_sqs_queue" "test_queue" {
  name = "test-queue"
}

# Lambda Function Setup
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "${path.module}/lambda_function.py"
  output_path = "${path.module}/lambda_function.zip"
}

module "lambda-reader" {
  source        = "terraform-aws-modules/lambda/aws"
  version       = "8.5.0"
  function_name = "test-reader"
  handler       = "index.handler"
  runtime       = "python3.13"
  source_path   = "${path.module}/lambda_function.py"

  attach_policy_statements = true
  policy_statements = {
    sqs = {
      effect    = "Allow"
      actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
      resources = [aws_sqs_queue.test_queue.arn]
    }
    s3 = {
      effect    = "Allow"
      actions   = ["s3:GetObject"]
      resources = [aws_s3_bucket.test.arn, "${aws_s3_bucket.test.arn}/*"]
    }
  }
}

module "lambda-writer" {
  source        = "terraform-aws-modules/lambda/aws"
  version       = "8.5.0"
  function_name = "test-writer"
  handler       = "index.handler"
  runtime       = "python3.13"
  source_path   = "${path.module}/lambda_function.py"

  attach_policy_statements = true
  policy_statements = {
    sqs = {
      effect    = "Allow"
      actions   = ["sqs:SendMessage"]
      resources = [aws_sqs_queue.test_queue.arn]
    }
    s3 = {
      effect    = "Allow"
      actions   = ["s3:PutObject"]
      resources = [aws_s3_bucket.test.arn, "${aws_s3_bucket.test.arn}/*"]
    }
  }
} # there is no link between lambda annd sqs because it is not a field in the resource rather a field in the policy doc
#it is actualy the module that is dependent on the queue
#dynamic blocks do not show up in the plan.json
#cloudwatch logs are also set by a var and not the direct link, this is traversable

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.30.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}
