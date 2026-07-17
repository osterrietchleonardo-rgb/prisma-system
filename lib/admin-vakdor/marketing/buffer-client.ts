const LINKEDIN_PERSONAL_CHANNEL = "6a4aca1140483446287320b8"
const CREATE_POST = `mutation($input: CreatePostInput!){ createPost(input:$input){ __typename ... on PostActionSuccess { post { id status } } ... on RestProxyError { message code } ... on InvalidInputError { message } ... on UnauthorizedError { message } ... on LimitReachedError { message } ... on NotFoundError { message } ... on UnexpectedError { message } } }`

export interface PublicarLinkedInInput {
  text: string
  imageUrl?: string | null
  dueAtISO?: string | null
}

interface CreatePostResult {
  __typename: string
  message?: string
  code?: string
  post?: { id: string; status: string }
}

/** Postea a LinkedIn vía Buffer. shareNow si no hay dueAtISO; customScheduled si lo hay. Sin firstComment (plan free). */
export async function publicarLinkedIn(input: PublicarLinkedInInput): Promise<{ id: string; status: string }> {
  const token = process.env.BUFFER_API_KEY
  if (!token) throw new Error("Falta BUFFER_API_KEY")
  const postInput: Record<string, unknown> = {
    channelId: LINKEDIN_PERSONAL_CHANNEL,
    text: input.text,
    schedulingType: "automatic",
    mode: input.dueAtISO ? "customScheduled" : "shareNow",
    saveToDraft: false,
  }
  if (input.dueAtISO) postInput.dueAt = input.dueAtISO
  if (input.imageUrl) postInput.assets = [{ image: { url: input.imageUrl } }]

  const res = await fetch("https://api.buffer.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: CREATE_POST, variables: { input: postInput } }),
    cache: "no-store",
  })
  const body = await res.json()
  if (body.errors) throw new Error(`Buffer GraphQL: ${JSON.stringify(body.errors).slice(0, 300)}`)
  const r = body?.data?.createPost as CreatePostResult | undefined
  if (!r || r.__typename !== "PostActionSuccess" || !r.post) {
    throw new Error(`Buffer: ${r?.message ?? r?.__typename ?? "respuesta inesperada"}`)
  }
  return { id: r.post.id, status: r.post.status }
}
