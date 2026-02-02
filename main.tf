/*module "lambda" {
  source        = "terraform-aws-modules/lambda/aws"
  version       = "8.4.0"
  function_name = "test"
  handler       = "index.handler"
  runtime       = "python3.13"
  source_path   = "."
}*/

resource "aws_s3_bucket" "test" {
  bucket = "test"
}

resource "aws_s3_bucket_object" "test" {
  bucket = aws_s3_bucket.test.id
  key    = "test"
  source = "test.txt"
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

resource "aws_iam_role" "iam_for_lambda" {
  name = "iam_for_lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

resource "aws_lambda_function" "test_lambda" {
  filename      = data.archive_file.lambda_zip.output_path
  function_name = "test_lambda"
  role          = aws_iam_role.iam_for_lambda.arn
  handler       = "lambda_function.handler"

  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime = "python3.9"
}

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
