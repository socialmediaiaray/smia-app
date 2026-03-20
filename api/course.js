// api/course.js — Proxy seguro para a API do MemberKit
// Busca aulas em lotes para evitar rate limit (429)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchLesson(lessonId, apiKey) {
  const res = await fetch(
    `https://memberkit.com.br/api/v1/lessons/${lessonId}?api_key=${apiKey}`
  );
  if (!res.ok) return null;
  return await res.json();
}

async function fetchInBatches(lessons, apiKey, batchSize = 5, delay = 600) {
  const results = [];
  for (let i = 0; i < lessons.length; i += batchSize) {
    const batch = lessons.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(l => fetchLesson(l.id, apiKey).catch(() => null))
    );
    results.push(...batchResults);
    if (i + batchSize < lessons.length) await sleep(delay);
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  // Cache por 10 minutos na Vercel CDN — evita rebuscar a cada acesso
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = process.env.MEMBERKIT_API_KEY;
  const COURSE_ID = process.env.MEMBERKIT_COURSE_ID;

  if (!API_KEY || !COURSE_ID) {
    return res.status(500).json({ error: 'Variáveis de ambiente não configuradas.' });
  }

  try {
    // 1. Busca estrutura do curso
    const courseRes = await fetch(
      `https://memberkit.com.br/api/v1/courses/${COURSE_ID}?api_key=${API_KEY}`
    );
    if (!courseRes.ok) throw new Error(`MemberKit retornou ${courseRes.status}`);
    const course = await courseRes.json();

    // 2. Coleta todas as aulas de todas as seções
    const allLessons = (course.sections || []).flatMap(s => s.lessons || []);

    // 3. Busca em lotes de 5 com 600ms de pausa — respeita o rate limit da API
    const lessonDetails = await fetchInBatches(allLessons, API_KEY, 5, 600);

    // 4. Monta mapa id -> detalhes
    const lessonMap = {};
    lessonDetails.forEach(l => { if (l) lessonMap[l.id] = l; });

    // 5. Reconstrói seções com conteúdo completo, ordenando aulas por position
    const sectionsWithContent = (course.sections || []).map(section => ({
      ...section,
      lessons: (section.lessons || [])
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(l => lessonMap[l.id] || { ...l, content: '', files: [], video: null })
    }));

    return res.status(200).json({
      id: course.id,
      name: course.name,
      description: course.description,
      sections: sectionsWithContent,
    });

  } catch (err) {
    console.error('Erro ao buscar dados do MemberKit:', err);
    return res.status(500).json({ error: err.message });
  }
}
