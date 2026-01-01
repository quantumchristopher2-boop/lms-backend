const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const generateQuiz = async (course, difficulty = 'medium', numQuestions = 10) => {
  try {
    const contentText = course.contents?.map(c => `${c.title}: ${c.content || ''}`).join('\n') || '';
    
    const prompt = `Create ${numQuestions} multiple choice questions about:
Title: ${course.title}
Description: ${course.description}
Content: ${contentText}
Difficulty: ${difficulty}

Return JSON array:
[{
  "question": "text",
  "options": ["A", "B", "C", "D"],
  "correctAnswer": 0,
  "explanation": "why"
}]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7
    });
    
    return JSON.parse(response.choices[0].message.content);
  } catch (error) {
    console.error('AI quiz error:', error);
    return [];
  }
};

module.exports = { generateQuiz };