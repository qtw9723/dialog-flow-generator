import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { VALID_CATEGORIES } from "../_shared/solutionRuleCategories.ts"
import { isDevRequest, tablePicker } from "../_shared/devTables.ts"
import { callOpenAiChat } from "../_shared/llmCall.ts"

// 카테고리 목록은 _shared가 단일 소스다.

// Category descriptions for OpenAI prompts (Korean)
const categoryDescriptions = {
  "Solution Rule": "솔루션 규칙 - 솔루션이 따라야 할 기본 원칙과 제약조건",
  "System Variable": "시스템 변수 - 자동으로 생성되는 변수와 그 설명",
  "Node Usage Rule": "노드 사용 규칙 - 플로우 구조·노드 종류 사용 규칙",
  "Variable Usage Rule": "변수 사용 규칙 - 변수 명명·스코프·선언 순서 규칙",
  "Value Generation Rule": "값 생성 규칙 - set/esd config 값과 식별자 생성 규칙",
  "Output Message Rule": "출력 멘트 규칙 - output 노드 안내 문장·변수 참조 규칙",
  "Condition Rule": "조건 규칙 - 시나리오 진입 트리거·분기 조건식 규칙",
  "Loop Rule": "루프 규칙 - 검증 가능한 입력형식(숫자·날짜·전화번호 등)을 형식에 맞을 때까지 되묻는 subflow 재시도 루프 설정",
  "NLP Function Reference": "NLP 기능 레퍼런스 - 인텐트·엔티티 학습 데이터(NLP) 작성 참고 자료. 참조 전용이며 현재 어떤 생성 프롬프트에도 주입되지 않는다(조건 생성 연동은 이후 버전)"
};

interface SolutionRule {
  id?: string;
  category: string;
  title: string;
  description?: string;
  content: any;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Convert free-form text to JSON structure using OpenAI API
 */
async function convertTextToJSON(
  text: string,
  category: string,
  openaiApiKey: string
): Promise<any> {
  const categoryDesc =
    categoryDescriptions[category as keyof typeof categoryDescriptions] || `${category} 규칙`;

  const prompt = `You are a JSON schema generator for solution rules. Convert the following text into a structured JSON array.

CATEGORY: ${category}
DESCRIPTION: ${categoryDesc}

TEXT TO CONVERT:
${text}

Convert this text into a JSON array with the following structure. Each item should have:
- key: field name or rule name
- type: data type (string, boolean, number, array, object)
- description: clear description of what this field/rule means

Return ONLY a valid JSON array in this exact format:
[
  {
    "key": "field_name",
    "type": "string",
    "description": "Description of this field"
  }
]

CRITICAL INSTRUCTIONS:
- Return ONLY the JSON array itself
- NO markdown code blocks or triple backticks
- NO explanations, no preamble, no markdown
- Ensure all information from the text is captured
- Each item must have all three fields: key, type, description
- Use clear, concise descriptions
- Do not miss any information from the input text
- Start with [ and end with ] - nothing else`;

  try {
    // HTTP 오류·잘린 응답은 callOpenAiChat이 던진다(공유 모듈) — 아래에서 잡아 재던진다.
    // content가 빈 경우는 callOpenAiChat이 던지지 않고 ''를 반환하므로, 그 다음의
    // "Empty response" 검사는 여전히 필요해 남겨둔다(중복이 아니라 실질적인 안전장치).
    const responseText = await callOpenAiChat({
      apiKey: openaiApiKey,
      prompt,
      temperature: 0.7,
      maxCompletionTokens: 8000,
    });

    if (!responseText) {
      console.error("[admin-solution-rules] Empty response from OpenAI API");
      throw new Error("Empty response from OpenAI API");
    }

    console.log("[admin-solution-rules] Raw response text:", responseText);

    // Extract JSON array using regex - improved to handle nested brackets
    let jsonMatch = responseText.match(/\[[\s\S]*\]/);

    // If not found, try to find JSON starting after markdown code blocks
    if (!jsonMatch) {
      jsonMatch = responseText.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonMatch = [jsonMatch[1]];
      }
    }

    if (!jsonMatch) {
      console.error("[admin-solution-rules] Could not extract JSON. Response:", responseText);
      throw new Error("No valid JSON array found in OpenAI response");
    }

    console.log("[admin-solution-rules] Extracted JSON string:", jsonMatch[0]);

    const parsedJSON = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(parsedJSON)) {
      throw new Error("OpenAI response did not return a JSON array");
    }

    return parsedJSON;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse JSON from OpenAI response: ${error.message}`);
    }
    throw new Error(
      `Failed to convert text to JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function handleRequest(req: Request): Promise<Response> {
  const T = tablePicker(isDevRequest(req.url))  // DEV 슬러그(-dev)면 dev_ 테이블 사용
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
      status: 200
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const url = new URL(req.url);
    // Resolve rule id from `?id=` first (frontend's convention), then fall back to
    // a trailing path segment — but never treat the function name itself as an id.
    const pathParts = url.pathname.split("/").filter(Boolean);
    const lastPathPart = pathParts[pathParts.length - 1] || "";
    const queryRuleId = url.searchParams.get("id") || "";
    const ruleId = queryRuleId || (!lastPathPart.startsWith("admin-solution-rules") ? lastPathPart : "");

    // GET: Fetch all rules or filter by category
    if (req.method === "GET") {
      const category = url.searchParams.get("category");

      let query = supabase.from(T("solution_rules")).select("*");

      if (category) {
        if (!VALID_CATEGORIES.includes(category)) {
          return new Response(
            JSON.stringify({ error: `Invalid category: ${category}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        query = query.eq("category", category);
      }

      const { data, error } = await query.order("order_index", {
        ascending: true,
      });

      if (error) {
        throw error;
      }

      return new Response(JSON.stringify(data || []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST: Create new rule
    if (req.method === "POST") {
      const body = await req.json() as any;

      // Validate required fields
      if (!body.category || !body.title || !body.description) {
        return new Response(
          JSON.stringify({
            error: "Missing required fields: category, title, description",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Validate category
      if (!VALID_CATEGORIES.includes(body.category)) {
        return new Response(
          JSON.stringify({
            error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Handle content: support both direct content (JSON) and text (free-form)
      let finalContent: string;

      if (body.content !== undefined) {
        // Direct JSON object provided
        if (typeof body.content === "object" && body.content !== null) {
          finalContent = JSON.stringify(body.content);
        } else if (typeof body.content === "string") {
          finalContent = body.content;
        } else {
          return new Response(
            JSON.stringify({
              error: "content must be a JSON object or valid JSON string",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } else if (body.text !== undefined) {
        // Free-form text: convert to JSON using OpenAI
        const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
        if (!openaiApiKey) {
          return new Response(
            JSON.stringify({
              error: "OpenAI API key not configured. Cannot convert text to JSON.",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        try {
          const convertedJSON = await convertTextToJSON(
            body.text,
            body.category,
            openaiApiKey
          );
          finalContent = JSON.stringify(convertedJSON);
        } catch (conversionError) {
          return new Response(
            JSON.stringify({
              error: `Failed to convert text to JSON: ${conversionError instanceof Error ? conversionError.message : String(conversionError)}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
      } else {
        return new Response(
          JSON.stringify({
            error: "Either 'content' (JSON object) or 'text' (free-form string) is required",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Get the highest order_index for this category
      const { data: existingRules, error: fetchError } = await supabase
        .from(T("solution_rules"))
        .select("order_index")
        .eq("category", body.category)
        .order("order_index", { ascending: false })
        .limit(1);

      if (fetchError) {
        throw fetchError;
      }

      const nextOrderIndex =
        (existingRules && existingRules.length > 0
          ? existingRules[0].order_index
          : 0) + 1;

      const newRule: SolutionRule = {
        category: body.category,
        title: body.title,
        description: body.description,
        content: typeof finalContent === "string" ? JSON.parse(finalContent) : finalContent,
        order_index: nextOrderIndex,
      };

      const { data: createdRule, error: insertError } = await supabase
        .from(T("solution_rules"))
        .insert([newRule])
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return new Response(JSON.stringify(createdRule), {
        status: 201,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // PATCH: Update rule by ID
    if (req.method === "PATCH") {
      if (!ruleId) {
        return new Response(JSON.stringify({ error: "Missing rule id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const body = (await req.json()) as Partial<SolutionRule>;

      // Validate category if provided
      if (body.category && !VALID_CATEGORIES.includes(body.category)) {
        return new Response(
          JSON.stringify({
            error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}`,
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      // Add updated_at timestamp
      const updateData = {
        ...body,
        updated_at: new Date().toISOString(),
      };

      const { data: updatedRule, error: updateError } = await supabase
        .from(T("solution_rules"))
        .update(updateData)
        .eq("id", ruleId)
        .select()
        .single();

      if (updateError) {
        if (updateError.code === "PGRST116") {
          return new Response(JSON.stringify({ error: "Rule not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw updateError;
      }

      return new Response(JSON.stringify(updatedRule), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE: Delete rule by ID
    if (req.method === "DELETE") {
      if (!ruleId) {
        return new Response(JSON.stringify({ error: "Missing rule id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: deleteError } = await supabase
        .from(T("solution_rules"))
        .delete()
        .eq("id", ruleId);

      if (deleteError) {
        if (deleteError.code === "PGRST116") {
          return new Response(JSON.stringify({ error: "Rule not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw deleteError;
      }

      return new Response(JSON.stringify({ message: "Rule deleted successfully" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Method not allowed
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

Deno.serve(handleRequest);
