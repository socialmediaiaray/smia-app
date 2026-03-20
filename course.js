// api/course.js — Proxy seguro para a API do MemberKit
// A API_KEY fica guardada como variável de ambiente na Vercel (nunca exposta no frontend)

export default async function handler(req, res) {
  // Permite chamadas do frontend (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // cache 5 min

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const API_KEY = process.env.MEMBERKIT_API_KEY;
  const COURSE_ID = process.env.MEMBERKIT_COURSE_ID;

  if (!API_KEY || !COURSE_ID) {
    return res.status(500).json({ error: 'Variáveis de ambiente não configuradas.' });
  }

  try {
    // 1. Busca estrutura do curso (seções + lista de aulas)
    const courseRes = await fetch(
      `https://memberkit.com.br/api/v1/courses/${COURSE_ID}?api_key=${API_KEY}`
    );

    if (!courseRes.ok) {
      throw new Error(`MemberKit retornou ${courseRes.status}`);
    }

    const course = await courseRes.json();

    // 2. Para cada seção, busca o conteúdo completo de cada aula em paralelo
    const sectionsWithContent = await Promise.all(
      (course.sections || []).map(async (section) => {
        const lessonsWithContent = await Promise.all(
          (section.lessons || []).map(async (lesson) => {
            try {
              const lessonRes = await fetch(
                `https://memberkit.com.br/api/v1/lessons/${lesson.id}?api_key=${API_KEY}`
              );
              if (!lessonRes.ok) return { ...lesson, content: '', files: [], video: null };
              return await lessonRes.json();
            } catch {
              return { ...lesson, content: '', files: [], video: null };
            }
          })
        );
        return { ...section, lessons: lessonsWithContent };
      })
    );

    return res.status(200).json({
      id: course.id,
      name: course.name,
      description: course.description,
      sections: sectionsWithContent,
    });

  } catch (err) {
    console.error('Erro ao buscar dados do MemberKit:', err);
    return res.status(500).json({ error: 'Erro ao buscar dados do curso.' });
  }
}
