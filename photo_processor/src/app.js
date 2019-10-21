// photo_processor/src/app.js
const AWS = require('aws-sdk');
const S3 = new AWS.S3({ signatureVersion: 'v4' });
const DynamoDBDocClient = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const uuidv4 = require('uuid/v4');
// Note: Sharp requires native extensions. To get sharp to install from NPM in a
// way that's compatible with the Amazon Linux environment that AWS runs Node.js
// on, we can use this command: docker run -v "$PWD":/var/task lambci/lambda:build-nodejs8.10 npm install
const Sharp = require('sharp');
// We'll expect these environment variables to be defined when the Lambda function is deployed
const THUMBNAIL_WIDTH = parseInt(process.env.THUMBNAIL_WIDTH, 10);
const THUMBNAIL_HEIGHT = parseInt(process.env.THUMBNAIL_HEIGHT, 10);




// 2. NEW: Extract the name of the photos table
//    from an environment variable (we'll set this value via
//    our SAM template below...)
const DYNAMODB_PHOTOS_TABLE_NAME = process.env.DYNAMODB_PHOTOS_TABLE_ARN.split('/')[1];
// 3. NEW: Add a new function to handle putting
//    our new Photo info into DynamoDB
function storePhotoInfo(item) {
  const params = {
    Item: item,
    TableName: DYNAMODB_PHOTOS_TABLE_NAME
  };
  return DynamoDBDocClient.put(params).promise();
}
// 4. NEW: Add a new function to get the metadata for a photo
async function getMetadata(bucketName, key) {
  const headResult = await S3.headObject({Bucket: bucketName, Key: key }).promise();
  return headResult.Metadata;
}


function thumbnailKey(filename) {
    return `public/resized/${filename}`;
}
function fullsizeKey(filename) {
    return `public/${filename}`;
}
function makeThumbnail(photo) {
    return Sharp(photo).resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT).toBuffer();
}
async function resize(bucketName, key) {
    const originalPhoto = (await S3.getObject({ Bucket: bucketName, Key: key }).promise()).Body;
    const originalPhotoName = key.replace('uploads/', '');
    const originalPhotoDimensions = await Sharp(originalPhoto).metadata();
    const thumbnail = await makeThumbnail(originalPhoto);
    await Promise.all([
        S3.putObject({
            Body: thumbnail,
            Bucket: bucketName,
            Key: thumbnailKey(originalPhotoName),
        }).promise(),
        S3.copyObject({
            Bucket: bucketName,
            CopySource: bucketName + '/' + key,
            Key: fullsizeKey(originalPhotoName),
        }).promise(),
    ]);
    await S3.deleteObject({
        Bucket: bucketName,
        Key: key
    }).promise();
    return {
        photoId: originalPhotoName,

        thumbnail: {
            key: thumbnailKey(originalPhotoName),
            width: THUMBNAIL_WIDTH,
            height: THUMBNAIL_HEIGHT
        },
        fullsize: {
            key: fullsizeKey(originalPhotoName),
            width: originalPhotoDimensions.width,
            height: originalPhotoDimensions.height
        }
    };
};

async function processRecord(record) {
  const bucketName = record.s3.bucket.name;
  const key = record.s3.object.key;

  if (key.indexOf('uploads') != 0) return;

  const metadata = await getMetadata(bucketName, key);
  const sizes = await resize(bucketName, key);
  const id = uuidv4();
  const item = {
    id: id,
    owner: metadata.owner,
    photoAlbumId: metadata.albumid,
    bucket: bucketName,
    thumbnail: sizes.thumbnail,
    fullsize: sizes.fullsize,
    createdAt: new Date().getTime()
  }
  await storePhotoInfo(item);
}

exports.lambda_handler = async (event, context, callback) => {
    try {
        event.Records.forEach(processRecord);
        callback(null, { status: 'Photo Processed' });
    }
    catch (err) {
        console.error(err);
        callback(err);
    }
};
