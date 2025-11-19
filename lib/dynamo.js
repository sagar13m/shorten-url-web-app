
import { DynamoDBClient, PutItemCommand, GetItemCommand, ScanCommand, DeleteItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const REGION = process.env.AWS_REGION;
const TABLE = process.env.DYNAMO_TABLE;

const client = new DynamoDBClient({ region: REGION });

export async function createLink({ code, url }) {
  const now = new Date().toISOString();
  const item = { code, url, clicks: 0, createdAt: now };
  const cmd = new PutItemCommand({
    TableName: TABLE,
    Item: marshall(item),
    ConditionExpression: "attribute_not_exists(code)"
  });
  return client.send(cmd);
}

export async function getLink(code) {
  const cmd = new GetItemCommand({
    TableName: TABLE,
    Key: marshall({ code })
  });
  const res = await client.send(cmd);
  return res.Item ? unmarshall(res.Item) : null;
}

export async function listLinks() {
  const cmd = new ScanCommand({ TableName: TABLE });
  const res = await client.send(cmd);
  return (res.Items || []).map(unmarshall);
}

export async function deleteLink(code) {
  const cmd = new DeleteItemCommand({
    TableName: TABLE,
    Key: marshall({ code })
  });
  return client.send(cmd);
}

export async function incrementClick(code) {
  const now = new Date().toISOString();
  const cmd = new UpdateItemCommand({
    TableName: TABLE,
    Key: marshall({ code }),
    UpdateExpression: "SET lastClickedAt = :t ADD clicks :inc",
    ExpressionAttributeValues: marshall({ ":t": now, ":inc": 1 })
  });
  return client.send(cmd);
}
