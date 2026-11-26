import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { usernameToEmail } from "@/lib/arabic";

async function assertAdmin(
  supabase: {
    rpc: (
      fn: "has_role",
      args: { _user_id: string; _role: "admin" },
    ) => PromiseLike<{ data: boolean | null }>;
  },
  userId: string,
) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("هذه العملية للمدير فقط");
}

const roleEnum = z.enum(["admin", "storekeeper", "cashier"]);

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        username: z
          .string()
          .trim()
          .min(3)
          .max(32)
          .regex(/^[a-zA-Z0-9._-]+$/),
        password: z.string().min(6).max(72),
        fullName: z.string().max(80).optional(),
        roles: z.array(roleEnum).min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username.toLowerCase(), full_name: data.fullName },
    });
    if (error)
      throw new Error(
        error.message.includes("already") ? "اسم المستخدم مستخدم مسبقاً" : error.message,
      );
    const id = created.user.id;
    await supabaseAdmin.from("user_roles").delete().eq("user_id", id);
    await supabaseAdmin
      .from("user_roles")
      .insert(data.roles.map((role) => ({ user_id: id, role })));
    return { id };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ userId: z.string().uuid(), password: z.string().min(6).max(72) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(6).max(72),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error("لم يتم العثور على جلسة نشطة");
    const { error } = await supabase.auth.updateUser({
      password: data.newPassword,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        fullName: z.string().max(80).optional().default(""),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) throw new Error("لم يتم العثور على جلسة نشطة");
    const userId = sessionData.session.user.id;
    const username = (sessionData.session.user.user_metadata as { username?: string })?.username;
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { id: userId, username: username ?? "", full_name: data.fullName || null },
        { onConflict: "id" },
      );
    if (error) throw new Error(error.message);
    const { error: metaError } = await supabase.auth.updateUser({
      data: { full_name: data.fullName || null },
    });
    if (metaError) throw new Error(metaError.message);
    return { ok: true };
  });
