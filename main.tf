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

module "lambda" {
  source        = "terraform-aws-modules/lambda/aws"
  version       = "8.5.0"
  function_name = "test"
  handler       = "index.handler"
  runtime       = "python3.13"
  source_path   = "${path.module}/lambda_function.py"
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
