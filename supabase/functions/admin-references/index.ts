import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
}

function validateAgainstMaster(
  referenceJson: any,
  masterJson: any
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Validate that all master keys are present in reference (or it's a subset)
  const validateKeys = (masterObj: any, refObj: any, path: string = "") => {
    for (const key in masterObj) {
      const fullPath = path ? `${path}.${key}` : key
      if (!(key in refObj)) {
        errors.push(`Missing required key: ${fullPath}`)
      } else if (
        typeof masterObj[key] === "object" &&
        masterObj[key] !== null &&
        !Array.isArray(masterObj[key])
      ) {
        // Recursively validate nested objects (but not arrays)
        if (typeof refObj[key] === "object" && refObj[key] !== null) {
          validateKeys(masterObj[key], refObj[key], fullPath)
        } else {
          errors.push(`Type mismatch at ${fullPath}: expected object`)
        }
      }
    }
  }

  validateKeys(masterJson, referenceJson)
  return { valid: errors.length === 0, errors }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    const url = new URL(req.url)
    const id = url.searchParams.get("id")
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("dialogflow_references")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[admin-references] GET error:", error)
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

    if (req.method === "POST") {
      const body = await req.json()

      if (!body.name) {
        return new Response(JSON.stringify({ error: "name is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      // If marking as master, deactivate any existing master first
      if (body.is_master) {
        console.log("[admin-references] Setting new master, deactivating previous")
        await supabase
          .from("dialogflow_references")
          .update({ is_master: false })
          .eq("is_master", true)
      }

      // If not master and a master exists, validate against it
      if (!body.is_master) {
        const { data: masterRef } = await supabase
          .from("dialogflow_references")
          .select("json_data")
          .eq("is_master", true)
          .limit(1)

        if (masterRef && masterRef.length > 0) {
          console.log("[admin-references] Validating against master schema")
          const validation = validateAgainstMaster(body.json_data, masterRef[0].json_data)
          if (!validation.valid) {
            console.error("[admin-references] Validation failed:", validation.errors)
            return new Response(
              JSON.stringify({
                error: "Schema validation failed",
                details: validation.errors,
              }),
              {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 400,
              }
            )
          }
        }
      }

      // Get active master reference ID for non-master references
      let masterRefId = null
      if (!body.is_master) {
        const { data: masterData } = await supabase
          .from("dialogflow_references")
          .select("id")
          .eq("is_master", true)
          .limit(1)

        if (masterData && masterData.length > 0) {
          masterRefId = masterData[0].id
        }
      }

      const insertData = {
        name: body.name,
        json_data: body.json_data,
        is_master: body.is_master || false,
        master_reference_id: masterRefId,
        template_status: "pending",
        schema_validation_status: body.is_master ? "n/a" : "valid",
      }

      const { data, error } = await supabase
        .from("dialogflow_references")
        .insert([insertData])
        .select()

      if (error) {
        console.error("[admin-references] POST error:", error)
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

    if (req.method === "DELETE") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id query parameter is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      // Check if this is a master reference
      const { data: refToDelete } = await supabase
        .from("dialogflow_references")
        .select("id, is_master")
        .eq("id", id)
        .limit(1)

      if (!refToDelete || refToDelete.length === 0) {
        return new Response(JSON.stringify({ error: "Reference not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      // If deleting a master, clean up orphaned references
      if (refToDelete[0].is_master) {
        console.log("[admin-references] Cleaning up orphaned references after master deletion")
        const { error: cleanupError } = await supabase
          .from("dialogflow_references")
          .update({ master_reference_id: null })
          .eq("master_reference_id", id)

        if (cleanupError) {
          console.error("[admin-references] Cleanup error:", cleanupError)
          return new Response(JSON.stringify({ error: cleanupError.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500,
          })
        }
      }

      // Now delete the reference
      const { error } = await supabase
        .from("dialogflow_references")
        .delete()
        .eq("id", id)

      if (error) {
        console.error("[admin-references] DELETE error:", error)
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

    if (req.method === "PATCH") {
      if (!id) {
        return new Response(JSON.stringify({ error: "id query parameter is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        })
      }

      const body = await req.json()

      // Get the current reference to check if it's a master
      const { data: currentRef } = await supabase
        .from("dialogflow_references")
        .select("is_master, json_data")
        .eq("id", id)
        .limit(1)

      if (!currentRef || currentRef.length === 0) {
        return new Response(JSON.stringify({ error: "Reference not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        })
      }

      const updateData: any = {}
      if (body.name !== undefined) updateData.name = body.name
      if (body.scenario_description !== undefined) updateData.scenario_description = body.scenario_description
      if (body.json_data !== undefined) {
        console.log("[admin-references] JSON data has changed, resetting learning status")
        // If updating json_data for non-master, validate against master
        if (!currentRef[0].is_master) {
          const { data: masterRef } = await supabase
            .from("dialogflow_references")
            .select("json_data")
            .eq("is_master", true)
            .limit(1)

          if (masterRef && masterRef.length > 0) {
            const validation = validateAgainstMaster(body.json_data, masterRef[0].json_data)
            if (!validation.valid) {
              console.error("[admin-references] Validation failed:", validation.errors)
              return new Response(
                JSON.stringify({
                  error: "Schema validation failed",
                  details: validation.errors,
                }),
                {
                  headers: { ...corsHeaders, "Content-Type": "application/json" },
                  status: 400,
                }
              )
            }
          }
        }
        updateData.json_data = body.json_data
        // Reset learning status when JSON data is modified
        updateData.template_status = "pending"
        updateData.unified_template_status = "pending"
      }

      // Allow direct updates to unified_template_status (e.g., resetting when child references change)
      if (body.unified_template_status !== undefined) {
        console.log("[admin-references] Updating unified_template_status to:", body.unified_template_status)
        updateData.unified_template_status = body.unified_template_status
      }

      // If setting as master, deactivate any existing master first
      if (body.is_master === true) {
        console.log("[admin-references] Setting new master, deactivating previous")
        await supabase
          .from("dialogflow_references")
          .update({ is_master: false })
          .eq("is_master", true)
        updateData.is_master = true
      }

      console.log("[admin-references] Updating reference with fields:", Object.keys(updateData))
      if (updateData.template_status || updateData.unified_template_status) {
        console.log("[admin-references] Learning status reset to pending")
      }

      const { data, error } = await supabase
        .from("dialogflow_references")
        .update(updateData)
        .eq("id", id)
        .select()

      if (error) {
        console.error("[admin-references] PATCH error:", error)
        return new Response(JSON.stringify({ error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        })
      }

      return new Response(JSON.stringify(data[0]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      })
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    })
  } catch (error) {
    console.error("[admin-references] Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
