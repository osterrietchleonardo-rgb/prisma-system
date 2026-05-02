import { revalidateTag } from 'next/cache'

export async function POST() {
  try {
    revalidateTag('mercado')
    return Response.json({ revalidated: true, timestamp: new Date().toISOString() })
  } catch (error) {
    console.error('Error revalidating mercado cache:', error)
    return Response.json(
      { revalidated: false, error: 'Error al revalidar caché' },
      { status: 500 }
    )
  }
}
