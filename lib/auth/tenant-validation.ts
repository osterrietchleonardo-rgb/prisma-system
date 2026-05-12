import { createClient } from "@/utils/supabase/server";

export async function requireTenant() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error("Unauthorized");
  }

  // Get user profile to determine their agency
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.agency_id) {
    throw new Error("Tenant isolation failure");
  }

  return {
    userId: user.id,
    agencyId: profile.agency_id,
    role: profile.role,
  };
}

export async function logSecurityAlert(action: string, details?: Record<string, any>) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    // We try to get agency_id if possible
    let agencyId = null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("agency_id")
        .eq("id", user.id)
        .single();
      agencyId = profile?.agency_id || null;
    }

    await supabase.from("audit_logs").insert({
      user_id: user?.id || null,
      agency_id: agencyId,
      action,
      details,
    });
  } catch (error) {
    console.error("Failed to write security audit log", error);
  }
}

export async function consumeAiCredits(feature: string, amount: number = 1, promptSummary?: string) {
  const { userId, agencyId } = await requireTenant();
  const supabase = createClient();

  const { data, error } = await supabase.rpc("consume_ai_credits", {
    p_agency_id: agencyId,
    p_user_id: userId,
    p_feature: feature,
    p_amount: amount,
    p_summary: promptSummary || `${feature} usage`
  });

  if (error) {
    console.error("AI Credit consumption failed", error);
    throw new Error(error.message || "Insufficient AI credits");
  }

  return true;
}
