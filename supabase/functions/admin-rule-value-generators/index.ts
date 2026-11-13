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
    const referenceId = url.searchParams.get("reference_id")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // GET: Fetch value generators for a specific reference
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
        .from("rule_value_generators")
        .select("*")
        .eq("reference_id", referenceId)
        .order("order_index", { ascending: true })

      if (error) {
        console.error("[admin-rule-value-generators] GET error:", error)
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

    // POST: Create new value generator
    if (req.method === "POST") {
      const body = await req.json()

      // Validate required fields
      if (!body.reference_id || !body.json_path || !body.rule_type || !body.rule_config) {
        return new Response(
          JSON.stringify({
            error: "reference_id, json_path, rule_type, and rule_config are required",
          }),
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

      // Validate rule_config is a valid JSON object
      if (typeof body.rule_config !== "object" || body.rule_config === null) {
        return new Response(
          JSON.stringify({ error: "rule_config must be a valid JSON object" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      // Validate function_code if rule_type is 'function'
      if (body.rule_type === "function" && body.rule_config.function_code) {
        const isSafe = validateFunctionCode(body.rule_config.function_code)
        if (!isSafe) {
          return new Response(
            JSON.stringify({ error: "function_code contains unsafe operations" }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            }
          )
        }
      }

      // Set default values if not provided
      if (body.order_index === undefined) {
        body.order_index = 0
      }
      if (body.enabled === undefined) {
        body.enabled = true
      }

      const { data, error } = await supabase
        .from("rule_value_generators")
        .insert([body])
        .select()

      if (error) {
        console.error("[admin-rule-value-generators] POST error:", error)
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

    // PATCH: Update value generator by ID
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

      // Validate rule_config is a valid JSON object if provided
      if (body.rule_config !== undefined && (typeof body.rule_config !== "object" || body.rule_config === null)) {
        return new Response(
          JSON.stringify({ error: "rule_config must be a valid JSON object" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          }
        )
      }

      // Validate function_code if rule_type is 'function' and function_code is provided
      if (body.rule_type === "function" && body.rule_config?.function_code) {
        const isSafe = validateFunctionCode(body.rule_config.function_code)
        if (!isSafe) {
          return new Response(
            JSON.stringify({ error: "function_code contains unsafe operations" }),
            {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 400,
            }
          )
        }
      }

      const { data, error } = await supabase
        .from("rule_value_generators")
        .update(body)
        .eq("id", id)
        .select()

      if (error) {
        console.error("[admin-rule-value-generators] PATCH error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      if (!data || data.length === 0) {
        return new Response(JSON.stringify({ error: "Value generator not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      return new Response(JSON.stringify(data[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    // DELETE: Delete value generator by ID
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
        .from("rule_value_generators")
        .delete()
        .eq("id", id)

      if (error) {
        console.error("[admin-rule-value-generators] DELETE error:", error)
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
    console.error("[admin-rule-value-generators] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

// Validate function code - block dangerous operations
function validateFunctionCode(code: string): boolean {
  const dangerousPatterns = [
    /require\s*\(/,
    /import\s+/,
    /eval\s*\(/,
    /Function\s*\(/,
    /process\./,
    /child_process/,
    /fs\./,
    /fetch\s*\(/,
    /XMLHttpRequest/,
    /global\./,
    /window\./,
  ]

  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      return false
    }
  }

  return true
}
