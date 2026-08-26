import { createFileRoute } from "@tanstack/react-router";

/**
 * One-time bootstrap of the very first Administrator account.
 *
 * It is a no-op (409) as soon as any Administrator profile exists, so it
 * cannot be used to escalate privileges once the system is live.
 */
const toE164 = (phone: string) => (phone.startsWith("+") ? phone : `+256${phone.replace(/^0/, "")}`);
const phoneToEmail = (e164: string) => `${e164.replace("+", "")}@staff.chetumicrofinance.local`;

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const body = (await request.json().catch(() => ({}))) as {
          phone_number?: string;
          password?: string;
          full_name?: string;
        };

        const phone = (body.phone_number ?? "").trim();
        const password = body.password ?? "";
        const fullName = (body.full_name ?? "System Administrator").trim();

        if (!/^07\d{8}$/.test(phone) || password.length < 8) {
          return Response.json(
            { error: "phone_number must be 10 digits starting 07 and password at least 8 characters" },
            { status: 400 },
          );
        }

        const { count, error: countError } = await supabaseAdmin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "Administrator");

        if (countError) return Response.json({ error: countError.message }, { status: 500 });
        if ((count ?? 0) > 0) {
          return Response.json({ error: "An administrator already exists" }, { status: 409 });
        }

        const e164 = toE164(phone);
        const email = phoneToEmail(e164);

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: "Administrator", phone_number: phone },
        });

        if (error || !data.user) {
          return Response.json({ error: error?.message ?? "Failed to create user" }, { status: 500 });
        }

        const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
          id: data.user.id,
          email,
          full_name: fullName,
          role: "Administrator",
          phone_number: phone,
          status: "Active",
        });

        if (profileError) return Response.json({ error: profileError.message }, { status: 500 });

        return Response.json({ ok: true, phone_number: phone });
      },
    },
  },
});
