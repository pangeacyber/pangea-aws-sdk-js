# Pangea + AWS SDK for JavaScript BedrockRuntime Client

A wrapper around the AWS SDK's JavaScript BedrockRuntime Client that wraps the
it with Pangea AI Guard. Supports Node.js v22 and greater.

## Installation

```bash
npm install @pangeacyber/aws-sdk
```

## Usage

```typescript
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PangeaBedrockRuntimeClient } from "@pangeacyber/aws-sdk";

const client = new PangeaBedrockRuntimeClient({
  region: "us-east-1",
  pangeaApiKey: process.env.PANGEA_API_KEY!,
});

const modelId = "anthropic.claude-3-5-sonnet-20240620-v1:0";

const userMessage =
  "Describe the purpose of a 'hello world' program in one line.";
const conversation = [
  {
    role: "user" as const,
    content: [{ text: userMessage }],
  },
];

const command = new ConverseCommand({
  modelId,
  messages: conversation,
  inferenceConfig: { maxTokens: 512, temperature: 0.5, topP: 0.9 },
});

try {
  const response = await client.send(command);

  const responseText = response.output?.message?.content?.[0].text;
  console.log(responseText);
} catch (err) {
  console.log(`ERROR: Can't invoke '${modelId}'. Reason: ${err}`);
  process.exit(1);
}
```
