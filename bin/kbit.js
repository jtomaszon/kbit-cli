#!/usr/bin/env node

var AWS = require('aws-sdk'),
  config = require('config'),
  fs = require('fs');

AWS.config.update({
  region: config.get('App.Region'),
});

var createS3Bucket = function () {
  var s3 = new AWS.S3();

  var params = {
    Bucket: config.get('App.BucketName'),
    ACL: 'public-read',
    CreateBucketConfiguration: {
      LocationConstraint: config.get('App.Region'),
    }
  };

  s3.createBucket(params, function (err, data) {
    if (err) console.log("createS3Bucket", err, err.stack);
  })
};
var createApplicationUser = function () {
  var iam = new AWS.IAM(),
    policyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "Stmt1465863717340",
          "Action": "s3:*",
          "Effect": "Allow",
          "Resource": "arn:aws:s3:::" + config.get('App.BucketName') + "/" + config.get('App.DefaultUser')
            }
          ]
    };

  iam.createGroup({
    GroupName: config.get('App.Name') + '-ApplicationGroup'
  }, function (err, data) {
    if (!err) {
      iam.createUser({
        UserName: config.get('App.DefaultUser')
      }, function (err, data) {
        if (!err) {
          iam.createAccessKey({
            UserName: data.User.UserName
          }, function (err, data) {
            if (!err) {
              console.log("aws_access_key_id = " + data.AccessKey.AccessKeyId)
              console.log("aws_secret_access_key = " + data.AccessKey.SecretAccessKey)
            } else console.log("createAccessKey", err, err.stack);
          })

          iam.putGroupPolicy({
            GroupName: config.get('App.Name') + '-ApplicationGroup',
            PolicyDocument: JSON.stringify(policyDocument),
            PolicyName: config.get('App.Name') + '-DeploymentPolicy',
          }, function (err, data) {
            if (!err) {
              iam.addUserToGroup({
                GroupName: config.get('App.Name') + '-ApplicationGroup',
                UserName: config.get('App.DefaultUser')
              }, function (err, data) {
                if (!err) {
                  console.log('S3 Bucket created: ' + 'http://' + config.get('App.BucketName') + '.s3.amazonaws.com/')
                } else console.log("putGroupPolicy", err, err.stack);
              })
            } else console.log(err, err.stack);
          });

        } else console.log("createApplicationUser", err, err.stack);
      })
    } else console.log(err, err.stack);
  })

};
var createRDSInstance = function () {
  var rds = new AWS.RDS();
  var ec2 = new AWS.EC2();

  ec2.createSecurityGroup({
    Description: 'Default rules for RDS',
    GroupName: 'fw-' + config.get('App.Name') + '-db'
  }, function (err, data) {
    if (!err) {
      var params = {
        DBInstanceClass: config.get('App.DBInstanceType'),
        DBInstanceIdentifier: config.get('App.Name'),
        Engine: config.get('App.DBEngine'),
        AllocatedStorage: 20,
        AutoMinorVersionUpgrade: false,
        AvailabilityZone: config.get('App.AvailabilityZone'),
        MasterUserPassword: config.get('App.DBPassword'),
        MasterUsername: config.get('App.DBUsername'),
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
        else console.log("createDBInstance", "DONE");
      });

      ec2.authorizeSecurityGroupIngress({
        GroupName: 'fw-' + config.get('App.Name') + '-db',
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
var createEC2Instance = function () {
  var ec2 = new AWS.EC2();
  var params = {
    KeyName: config.get('App.KeyName')
  }

  ec2.createSecurityGroup({
    Description: 'Default rules for WEB',
    GroupName: 'fw-' + config.get('App.Name') + '-web'
  }, function (err, data) {
    if (err) console.log("createSecurityGroup", err, err.stack);
    else createMasterKey();
  });

  var createMasterKey = function () {
    ec2.createKeyPair(params, function (err, data) {
      if (err) console.log(err, err.stack);
      else {
        fs.writeFile(process.env.HOME + '/.ssh/' + config.get('App.KeyName') + '.pem',
          data.KeyMaterial, {
            mode: '400'
          },
          function (err, result) {
            if (err) console.log("createKeyPair", err);
            else createInstance();
          })
      }
    })

  };
  
  var createInstance = function () {
    var params = {
      ImageId: config.get('App.ImageId'),
      MaxCount: 1,
      MinCount: 1,
      InstanceType: config.get('App.InstanceType'),
      KeyName: 'designa-cloud',
      Placement: {
        AvailabilityZone: config.get('App.AvailabilityZone'),
      },
      SecurityGroups: [
          'fw-' + config.get('App.Name') + '-web'
        ]
    };

    ec2.runInstances(params, function (err, data) {
      if (err) console.log("runInstances", err, err.stack);
      else {
        console.log("runInstances", "DONE")
        installWebPorts();
      }
    });
  }

  var installWebPorts = function () {
    var promises = [22, 80, 443, 3000].map(function (port) {
      var params = {
        GroupName: 'fw-' + config.get('App.Name') + '-web',
        FromPort: port,
        ToPort: port,
        IpProtocol: 'TCP',
        CidrIp: '0.0.0.0/0'
      }
      return new Promise(function (resolve, reject) {
        ec2.authorizeSecurityGroupIngress(params, function (err, data) {
          if (err) return reject(err)
          console.log("authorizeSecurityGroupIngress", "PORT: " + port + " enabled")
          resolve();
        })
      })
    })

    Promise.all(promises)
      .then(function () {
        console.log("authorizeSecurityGroupIngress", "EC2 Firewall successfully installed")
      })
      .catch(console.error);
  }

};
var createELBInstance = function () {};

createEC2Instance();
createS3Bucket();
createApplicationUser();
createRDSInstance();