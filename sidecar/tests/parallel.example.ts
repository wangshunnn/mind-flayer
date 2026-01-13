import Parallel from "parallel-web"

const client = new Parallel({ apiKey: "qSrrZKT4vu76dPiotBLVN5yMkvZM9NNe7wuT8kiz" })

async function main() {
  const search = await client.beta.search({
    mode: "agentic",
    objective: "搜索最新的科技新闻",
    search_queries: ["最新科技新闻", "科技趋势"],
    max_results: 10,
    excerpts: {
      max_chars_per_result: 3000
    }
  })

  console.log(search.results)
}

main().catch(console.error)
