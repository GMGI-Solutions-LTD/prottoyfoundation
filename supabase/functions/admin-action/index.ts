import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";

const USERNAME_DOMAIN = "prottoy.local";

const ActionSchema = z.object({
  action: z.enum([
    "deactivate", "reactivate", "promote", "demote", "delete",
    "reset_password", "change_username",
  ]),
  target_user_id: z.string().uuid(),
  new_password: z.string().min(8).max(72).optional(),
  new_username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9_.-]+$/)
    .optional(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const actorId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: actorId });
    if (!isSuper) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = ActionSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid input" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { action, target_user_id, new_password, new_username } = parsed.data;

    if (target_user_id === actorId && (action === "delete" || action === "demote" || action === "deactivate")) {
      return new Response(JSON.stringify({ error: "You cannot perform this action on your own account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (action) {
      case "deactivate":
      case "reactivate": {
        const { error } = await admin
          .from("admin_profiles")
          .update({ is_active: action === "reactivate" })
          .eq("user_id", target_user_id);
        if (error) throw error;
        break;
      }
      case "promote": {
        const { error } = await admin
          .from("user_roles")
          .insert({ user_id: target_user_id, role: "super_admin" });
        if (error && !String(error.message).includes("duplicate")) throw error;
        break;
      }
      case "demote": {
        const { count } = await admin
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          return new Response(JSON.stringify({ error: "Cannot remove the last super admin" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await admin
          .from("user_roles")
          .delete()
          .eq("user_id", target_user_id)
          .eq("role", "super_admin");
        if (error) throw error;
        break;
      }
      case "delete": {
        const { data: targetRoles } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", target_user_id);
        const isTargetSuper = (targetRoles ?? []).some((r) => r.role === "super_admin");
        if (isTargetSuper) {
          const { count } = await admin
            .from("user_roles")
            .select("user_id", { count: "exact", head: true })
            .eq("role", "super_admin");
          if ((count ?? 0) <= 1) {
            return new Response(JSON.stringify({ error: "Cannot delete the last super admin" }), {
              status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        const { error } = await admin.auth.admin.deleteUser(target_user_id);
        if (error) throw error;
        break;
      }
      case "reset_password": {
        if (!new_password) {
          return new Response(JSON.stringify({ error: "new_password is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error } = await admin.auth.admin.updateUserById(target_user_id, { password: new_password });
        if (error) throw error;
        break;
      }
      case "change_username": {
        if (!new_username) {
          return new Response(JSON.stringify({ error: "new_username is required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const newEmail = `${new_username}@${USERNAME_DOMAIN}`;
        const { error: authErr } = await admin.auth.admin.updateUserById(target_user_id, {
          email: newEmail,
          email_confirm: true,
          user_metadata: { username: new_username },
        });
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { error: profErr } = await admin
          .from("admin_profiles")
          .update({ email: newEmail })
          .eq("user_id", target_user_id);
        if (profErr) throw profErr;
        break;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-action error", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
