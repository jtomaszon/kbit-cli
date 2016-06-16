#!/usr/bin/env node

var AWS = require('aws-sdk'),
  config = require('config');

var appName = 'kbittest',
  appRegion = 'sa-east-1';

var createS3Bucket = function () {
  var s3 = new AWS.S3();

  s3.createBucket({
      Bucket: appName,
      ACL: 'public-read',
      CreateBucketConfiguration: {
        LocationConstraint: appRegion
      }
    },
    function (err, data) {
      if (!err) {
        createApplicationUser();
      } else console.log("createS3Bucket", err, err.stack);
    })
};

var createApplicationUser = function () {
  var iam = new AWS.IAM(),
    groupName = appName + '-ApplicationGroup',
    policyName = appName + '-DeploymentPolicy',
    policyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "Stmt1465863717340",
          "Action": "s3:*",
          "Effect": "Allow",
          "Resource": "arn:aws:s3:::" + appName + "/" + appName
        }
      ]
    };
  iam.createGroup({
    GroupName: groupName
  }, function (err, data) {
    if (!err) {
      iam.createUser({
        UserName: appName
      }, function (err, data) {
        if (!err) {
          iam.createAccessKey({
            UserName: data.User.UserName
          }, function (err, data) {
            if (!err) {
              console.log("aws_access_key_id = " + data.AccessKey.AccessKeyId)
              console.log("aws_secret_access_key = " + data.AccessKey.SecretAccessKey)
            } else console.log(err, err.stack);
          })
          iam.putGroupPolicy({
            GroupName: groupName,
            PolicyDocument: JSON.stringify(policyDocument),
            PolicyName: policyName
          }, function (err, data) {
            if (!err) {
              iam.addUserToGroup({
                GroupName: groupName,
                UserName: appName
              }, function (err, data) {
                if (!err) {
                  console.log('S3 Bucket created: ' + 'http://' + appName + '.s3.amazonaws.com/')
                } else console.log("putGroupPolicy", err, err.stack);
              })
            } else console.log(err, err.stack);
          });

        } else console.log("createApplicationUser", err, err.stack);
      })
    } else console.log(err, err.stack);
  })

};

var createEC2Instance = function () {};
var createELBInstance = function () {};
var createRDSInstance = function () {};

createS3Bucket();