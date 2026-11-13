import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

const VALID_RULE_TYPES = ["direct", "template", "function", "conditional", "array", "reference"]

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
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // GET: Fetch all templates or a specific template by ID
    if (req.method === "GET") {
      let query = supabase.from("rule_templates").select("*")

      if (id) {
        query = query.eq("id", id)
      }

      const { data, error } = await query.order("name", { ascending: true })

      if (error) {
        console.error("[admin-rule-templates] GET error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      // Return single object if ID is provided, otherwise return array
      return new Response(JSON.stringify(id ? (data?.[0] || null) : data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // POST: Create new template
    if (req.method === "POST") {
      const body = await req.json()

      // Validate required fields
      if (!body.name || !body.rule_type) {
        return new Response(
          JSON.stringify({ error: "name and rule_type are required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      // Validate rule_type
      if (!VALID_RULE_TYPES.includes(body.rule_type)) {
        return new Response(
          JSON.stringify({
            error: `Invalid rule_type: ${body.rule_type}. Must be one of: ${VALID_RULE_TYPES.join(", ")}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const { data, error } = await supabase
        .from("rule_templates")
        .insert([body])
        .select()

      if (error) {
        console.error("[admin-rule-templates] POST error:", error)
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

    // PATCH: Update template by ID
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

      // Validate rule_type if provided
      if (body.rule_type && !VALID_RULE_TYPES.includes(body.rule_type)) {
        return new Response(
          JSON.stringify({
            error: `Invalid rule_type: ${body.rule_type}. Must be one of: ${VALID_RULE_TYPES.join(", ")}`,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      const { data, error } = await supabase
        .from("rule_templates")
        .update(body)
        .eq("id", id)
        .select()

      if (error) {
        console.error("[admin-rule-templates] PATCH error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      if (!data || data.length === 0) {
        return new Response(JSON.stringify({ error: "Template not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      return new Response(JSON.stringify(data[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // DELETE: Delete template by ID
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
        .from("rule_templates")
        .delete()
        .eq("id", id)

      if (error) {
        console.error("[admin-rule-templates] DELETE error:", error)
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
    console.error("[admin-rule-templates] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
