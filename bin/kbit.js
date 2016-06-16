#!/usr/bin/env node

var AWS = require('aws-sdk'),
  config = require('config');

var appName = 'kbittest',
  appRegion = 'us-east-1';

AWS.config.update({
  region: appRegion
});

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
var createRDSInstance = function () {
  vpcSecurityGroupIds = '';

  var rds = new AWS.RDS();
  var ec2 = new AWS.EC2();

  ec2.createSecurityGroup({
    Description: 'Default rules for RDS',
    GroupName: 'fw-' + appName + '-db'
  }, function (err, data) {
    if (!err) {
      console.log("createSecurityGroup", data.GroupId)

      var params = {
        DBInstanceClass: 'db.t2.micro',
        DBInstanceIdentifier: appName,
        Engine: 'mysql',
        AllocatedStorage: 20,
        AutoMinorVersionUpgrade: false,
        AvailabilityZone: appRegion + 'a',
        MasterUserPassword: 'password',
        MasterUsername: 'root',
        MultiAZ: false,
        PubliclyAccessible: true,
        StorageEncrypted: false,
        StorageType: 'gp2',
        VpcSecurityGroupIds: [
          data.GroupId,
        ]
      };
      rds.createDBInstance(params, function (err, data) {
        if (err) console.log("createDBInstance", err, err.stack);
        else console.log(data);
      });

      ec2.authorizeSecurityGroupIngress({
        GroupName: 'fw-' + appName + '-db',
        FromPort: 3306,
        ToPort: 3306,
        IpProtocol: 'TCP',
        CidrIp: '0.0.0.0/0'
      }, function (err, data) {
        if (!err) console.log("authorizeSecurityGroupIngress", "PORT: 3306 enabled")
        else console.log("authorizeSecurityGroupIngress", err, err.stack);
      })
    } else console.log("createSecurityGroup", err, err.stack);
  });

};

//createRDSInstance();
//createS3Bucket();