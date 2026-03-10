import { Router, Request, Response, type Router as ExpressRouter } from 'express';
import OpenAI from 'openai';
import { SpeckleClient } from '@ectropy/shared/integrations';
import { logger } from '../../../../libs/shared/utils/src/logger.js';

const router: ExpressRouter = Router();

// FIVE WHY FIX (2026-03-06): Lazy initialization — OpenAI SDK v4 throws at
// construction if OPENAI_API_KEY is missing. Module-level instantiation
// crashed the entire api-gateway in CI/Docker where the key isn't set.
let _openai: OpenAI | null = null;
function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  }
  return _openai;
}

router.post('/estimate-cost', async (req: Request, res: Response) => {
  if (!(req as any).user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { streamId } = req.body;
  if (!streamId) {
    return res.status(400).json({ error: 'streamId required' });
  }

  try {
    const speckle = new SpeckleClient();
    const streamData = await speckle.getStreamData(streamId);

    // Extract basic quantities (simplified)
    const quantities = {
      objectCount: streamData.objects?.length || 0,
      streamName: streamData.name,
      createdAt: streamData.createdAt
    };

    const prompt = `You are a construction cost estimator. Given this BIM model data:
Project: ${quantities.streamName}
Objects: ${quantities.objectCount}

Provide a rough cost estimate with:
1. Total estimated cost (provide a realistic range)
2. Breakdown by: Materials 40%, Labor 35%, Equipment 15%, Overhead 10%
3. Key assumptions made

Format as JSON.`;

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });

    res.json({
      estimate: completion.choices[0].message.content,
      quantities,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('AI estimation failed:', error);
    res.status(500).json({ error: 'Estimation failed' });
  }
});

export default router;
