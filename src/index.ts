import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  ConverseCommand,
  type ServiceInputTypes,
  type ServiceOutputTypes,
} from '@aws-sdk/client-bedrock-runtime';
import type { SmithyResolvedConfiguration } from '@smithy/smithy-client';
import type {
  CheckOptionalClientConfig,
  Command,
  MetadataBearer,
} from '@smithy/types';
import { AIGuardService, PangeaConfig } from 'pangea-node-sdk';

export class PangeaError extends Error {}

export class PangeaAIGuardBlockedError extends PangeaError {
  constructor() {
    super('Pangea AI Guard returned a blocked response.');
  }
}

export class PangeaBedrockRuntimeClient extends BedrockRuntimeClient {
  private readonly aiGuardClient: AIGuardService;
  private readonly pangeaInputRecipe: string;
  private readonly pangeaOutputRecipe: string;

  constructor(
    ...[configuration]: CheckOptionalClientConfig<
      BedrockRuntimeClientConfig & {
        pangeaApiKey: string;
        pangeaInputRecipe?: string;
        pangeaOutputRecipe?: string;
      }
    >
  ) {
    super(configuration!);

    this.aiGuardClient = new AIGuardService(
      configuration!.pangeaApiKey,
      new PangeaConfig()
    );
    this.pangeaInputRecipe =
      configuration!.pangeaInputRecipe ?? 'pangea_prompt_guard';
    this.pangeaOutputRecipe =
      configuration!.pangeaOutputRecipe ?? 'pangea_llm_response_guard';
  }

  override async send<
    InputType extends object,
    OutputType extends MetadataBearer,
  >(
    command: Command<
      ServiceInputTypes,
      InputType,
      ServiceOutputTypes,
      OutputType,
      // biome-ignore lint/suspicious/noExplicitAny: couldn't match upstream
      SmithyResolvedConfiguration<any>
    >,
    // biome-ignore lint/suspicious/noExplicitAny: couldn't match upstream
    options?: any
  ): Promise<OutputType> {
    if (!(command instanceof ConverseCommand)) {
      return await super.send(command, options);
    }

    const { messages } = command.input;
    if (!messages) {
      // @ts-expect-error
      return await super.send(command, options);
    }

    const pangeaMessages: { role?: 'assistant' | 'user'; content?: string }[] =
      messages.map((message) => ({
        role: message.role,
        content: message.content
          ? message.content.map(({ text }) => text).join('\n')
          : undefined,
      }));

    const guardInputResponse = await this.aiGuardClient.guard({
      input: { messages: pangeaMessages },
      recipe: this.pangeaInputRecipe,
    });

    if (guardInputResponse.result.blocked) {
      throw new PangeaAIGuardBlockedError();
    }

    if (
      guardInputResponse.result.transformed &&
      guardInputResponse.result.output?.messages &&
      Array.isArray(guardInputResponse.result.output.messages)
    ) {
      command.input.messages = guardInputResponse.result.output.messages.map(
        (message) => ({
          role: message.role,
          content: [{ text: message.content }],
        })
      );
    }

    const response = await super.send(command, options);
    if (!response.output?.message?.content) {
      // @ts-expect-error
      return response;
    }

    const guardOutputResponse = await this.aiGuardClient.guard({
      // The LLM response must be contained within a single "assistant" message
      // to AI Guard. Splitting up the content parts into multiple "assistant"
      // messages will result in only the last message being processed.
      input: {
        messages: pangeaMessages.concat([
          {
            role: 'assistant',
            content: response.output.message.content
              .map(({ text }) => text)
              .join('\n'),
          },
        ]),
      },
      recipe: this.pangeaOutputRecipe,
    });

    if (guardOutputResponse.result.blocked) {
      throw new PangeaAIGuardBlockedError();
    }

    if (
      guardOutputResponse.result.transformed &&
      guardOutputResponse.result.output?.messages &&
      Array.isArray(guardOutputResponse.result.output.messages)
    ) {
      response.output.message.content = [
        {
          text: guardOutputResponse.result.output.messages.at(-1)?.content,
        },
      ];
    }

    // @ts-expect-error
    return response;
  }
}
