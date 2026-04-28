import { generateObject, type LanguageModel } from 'ai';
import { Stage1Result, type Stage1Result as Stage1ResultType } from './schemas';
import { STAGE1_SYSTEM, STAGE1_USER } from './prompts';

export interface RunStage1Args {
  imageBytes: Uint8Array;
  mediaType: string;
  model?: LanguageModel;
}

/**
 * Stage 1 vision pass — pure visual extraction with no household priors.
 * Uses AI SDK v6 `generateObject` with a multimodal user message containing
 * the image as an `ImagePart` (type: 'image').
 */
export async function runStage1(args: RunStage1Args): Promise<Stage1ResultType> {
  const { object } = await generateObject({
    model: args.model ?? ('google/gemini-3-flash' as unknown as LanguageModel),
    schema: Stage1Result,
    system: STAGE1_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: STAGE1_USER },
          { type: 'image', image: args.imageBytes, mediaType: args.mediaType },
        ],
      },
    ],
  });
  return object;
}
