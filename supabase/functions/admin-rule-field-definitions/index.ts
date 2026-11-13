import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const VALID_FIELD_TYPES = ["string", "number", "boolean", "array", "object"]

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const referenceId = url.searchParams.get("reference_id")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // GET: Fetch field definitions for a specific reference
    if (req.method === "GET") {
      if (!referenceId) {
        return new Response(
          JSON.stringify({ error: "reference_id query parameter is required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const { data, error } = await supabase
        .from("rule_field_definitions")
        .select("*")
        .eq("reference_id", referenceId)
        .order("json_path", { ascending: true })

      if (error) {
        console.error("[admin-rule-field-definitions] GET error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // POST: Create new field definition
    if (req.method === "POST") {
      const body = await req.json()

      // Validate required fields
      if (!body.reference_id || !body.json_path || !body.field_name || !body.field_type) {
        return new Response(
          JSON.stringify({
            error: "reference_id, json_path, field_name, and field_type are required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      // Validate field_type
      if (!VALID_FIELD_TYPES.includes(body.field_type)) {
        return new Response(
          JSON.stringify({
            error: `Invalid field_type: ${body.field_type}. Must be one of: ${VALID_FIELD_TYPES.join(", ")}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      // Set default value for is_required if not provided
      if (body.is_required === undefined) {
        body.is_required = true
      }

      const { data, error } = await supabase
        .from("rule_field_definitions")
        .insert([body])
        .select()

      if (error) {
        console.error("[admin-rule-field-definitions] POST error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify(data[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201,
      })
    }

    // PATCH: Update field definition by ID
    if (req.method === "PATCH") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id query parameter is required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const body = await req.json()

      // Validate field_type if provided
      if (body.field_type && !VALID_FIELD_TYPES.includes(body.field_type)) {
        return new Response(
          JSON.stringify({
            error: `Invalid field_type: ${body.field_type}. Must be one of: ${VALID_FIELD_TYPES.join(", ")}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const { data, error } = await supabase
        .from("rule_field_definitions")
        .update(body)
        .eq("id", id)
        .select()

      if (error) {
        console.error("[admin-rule-field-definitions] PATCH error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      if (!data || data.length === 0) {
        return new Response(JSON.stringify({ error: "Field definition not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      return new Response(JSON.stringify(data[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // DELETE: Delete field definition by ID
    if (req.method === "DELETE") {
      if (!id) {
        return new Response(
          JSON.stringify({ error: "id query parameter is required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const { error } = await supabase
        .from("rule_field_definitions")
        .delete()
        .eq("id", id)

      if (error) {
        console.error("[admin-rule-field-definitions] DELETE error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // Method not allowed
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  } catch (error) {
    console.error("[admin-rule-field-definitions] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
