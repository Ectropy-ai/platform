import { Router } from 'express';
import { rateLimiter } from '../middleware/rate-limiter.js';
import { OpenAI } from 'openai';
// TODO: Import database pool once available
// import { pool } from '@ectropy/database';

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export const codeGenerationRouter: Router = Router();

codeGenerationRouter.post('/', rateLimiter, async (req, res) => {
  try {
    const { template, requirements, language = 'typescript' } = req.body;

    // TODO: Query database once pool is available
    // const templateResult = await pool.query(
    //   'SELECT * FROM code_templates WHERE name = $1',
    //   [template]
    // );
    const templateResult: { rows: Array<{ template?: string }> } = { rows: [] }; // Stub

    const baseTemplate = templateResult.rows[0]?.template || '';

    let generatedCode = `// TODO: Generated code for ${requirements}`;
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are an expert ${language} developer for construction software. Generate production-ready code.`,
            },
            {
              role: 'user',
              content: `Using this template: ${baseTemplate}\n\nGenerate code for: ${requirements}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2000,
        });
        generatedCode = completion.choices[0].message.content || generatedCode;
      } catch (err) {
      }
    }

    // TODO: Update database once pool is available
    // await pool.query(
    //   'UPDATE code_templates SET usage_count = usage_count + 1 WHERE name = $1',
    //   [template]
    // );

    return res.json({
      success: true,
      code: generatedCode,
      metadata: { template, language, timestamp: new Date().toISOString() },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Code generation failed',
    });
  }
});
