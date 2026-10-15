/*
 * Static visualization using D3.js 7.9.0
 * 固定呈現 2024 年的資料。
 * ResizeObserver 只重新計算版面，保持窄螢幕上的文字可讀性。
 */
(() => {
  "use strict";

  const container = document.getElementById("chart");
  const errorElement = document.getElementById("chart-error");

  try {
    if (!window.d3) {
        throw new Error("無法載入 D3.js，請確認檔案完整。");
    }

    // 解析官方的 CSV 檔案，移除 BOM 並以年份與城市排除中文說明列及其他地區。
    const rawCsv = document.getElementById("density-data").textContent.replace(/^\uFEFF/, "");
    const rows = d3.csvParse(rawCsv);
    const numeric = value => {
      const text = String(value ?? "").trim().replace(/,/g, "");
      return text === "" ? NaN : Number(text);
    };
    const data = rows
      .filter(row => String(row.statistic_yyy).trim() === "113" &&
        String(row.site_id).trim().startsWith("臺北市"))
      .map(row => ({
        district: row.site_id.trim().replace(/^臺北市/, ""),
        population: numeric(row.people_total),
        area: numeric(row.area),
        density: numeric(row.population_density)
      }));

    const expected = ["松山區", "信義區", "大安區", "中山區", "中正區", "大同區",
      "萬華區", "文山區", "南港區", "內湖區", "士林區", "北投區"];
    if (data.length !== 12 || new Set(data.map(d => d.district)).size !== 12 ||
      expected.some(name => !data.some(d => d.district === name))) {
      throw new Error("資料必須完整包含 2024 年臺北市 12 個行政區，且不得重複。");
    }
    if (data.some(d => !Number.isFinite(d.density) || d.density <= 0 ||
      !Number.isFinite(d.population) || d.population <= 0 ||
      !Number.isFinite(d.area) || d.area <= 0)) {
      throw new Error("人口、面積或密度欄位含有無效或遺漏數值。");
    }

    // 由高至低排序，比較倍數使用官方公布值。
    data.sort((a, b) => d3.descending(a.density, b.density));
    const highest = data[0];
    const lowest = data[data.length - 1];
    const number = d3.format(",.0f");
    const ratio = d3.format(".1f")(highest.density / lowest.density);
    const insight = d3.select("#insight");
    insight.text(`${highest.district}人口密度為 ${number(highest.density)} 人／平方公里，約為${lowest.district}的 `);
    insight.append("strong").text(`${ratio} 倍`);
    insight.append("span").text("。");

    const colors = {
      ink: "#172c3c", secondary: "#526574", grid: "#e2e8ed",
      bar: "#779cb6", highlight: "#164b70"
    };
    const font = '"Taipei Chart", "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

    // 依容器 (Container) 寬度繪圖，不把固定寬度的圖縮小，以免顯示裝置上的字體過小。
    function render() {
      const width = Math.floor(container.getBoundingClientRect().width);
      if (width <= 0) return;
      const narrow = width < 520;
      const margin = { top: 36, right: narrow ? 56 : 68, bottom: 64, left: narrow ? 62 : 76 };
      const rowHeight = narrow ? 34 : 36;
      const plotHeight = data.length * rowHeight;
      const bottom = margin.top + plotHeight;
      const height = bottom + margin.bottom;

      // X 軸從零開始。
      // nice() 使最大刻度落在易讀的整數。
      const x = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.density)])
        .nice(5)
        .range([margin.left, width - margin.right]);
      const y = d3.scaleBand()
        .domain(data.map(d => d.district))
        .range([margin.top, bottom])
        .padding(0.26);

      const svg = d3.select(container).selectAll("svg")
        .data([null]).join("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("class", "density-chart")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", width).attr("height", height)
        .attr("role", "img")
        .attr("aria-labelledby", "density-title density-description")
        .attr("font-family", font)
        .attr("font-size", 14);

      // 重繪動作只重建圖內元素，避免重複 SVG、標籤或資料列。
      svg.selectAll("*").remove();
      svg.append("title").attr("id", "density-title")
        .text("2024 年臺北市 12 個行政區人口密度比較");
      svg.append("desc").attr("id", "density-description")
        .text(`水平長條圖，依人口密度由高至低排列，單位為人／平方公里。${data.map(d => `${d.district} ${number(d.density)}`).join("；")}。${highest.district}約為${lowest.district}的 ${ratio} 倍。`);

      // 針對窄螢幕使用 0、10,000、20,000、30,000 四個刻度，避免過於擁擠。
      const tickValues = x.ticks(narrow ? 3 : 6);
      svg.append("g").attr("class", "grid")
        .selectAll("line").data(tickValues).join("line")
        .attr("x1", d => x(d)).attr("x2", d => x(d))
        .attr("y1", margin.top - 7).attr("y2", bottom)
        .attr("stroke", colors.grid).attr("stroke-width", 1);

      // 每筆資料綁定一個 rect。
      // 寬度是 x(密度) - x(0)。
      svg.append("g").attr("class", "bars")
        .selectAll("rect").data(data, d => d.district).join("rect")
        .attr("data-district", d => d.district)
        .attr("data-density", d => d.density)
        .attr("x", x(0)).attr("y", d => y(d.district))
        .attr("width", d => x(d.density) - x(0))
        .attr("height", y.bandwidth())
        .attr("fill", d => d.density === highest.density ? colors.highlight : colors.bar);

      const yAxis = svg.append("g").attr("class", "y-axis")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).tickSize(0).tickPadding(12));
      yAxis.select(".domain").remove();
      yAxis.selectAll("text")
        .attr("font-family", font).attr("font-size", 14).attr("fill", colors.ink)
        .attr("font-weight", d => d === highest.district ? 700 : 400);

      const xAxis = svg.append("g").attr("class", "x-axis")
        .attr("transform", `translate(0,${bottom})`)
        .call(d3.axisBottom(x).tickValues(tickValues).tickFormat(number).tickSize(0).tickPadding(12));
      xAxis.select(".domain").remove();
      xAxis.selectAll("text")
        .attr("font-family", font).attr("font-size", narrow ? 11 : 12).attr("fill", colors.secondary);

      // 數字的部份直接顯示，不依賴 tooltip。
      // 右側邊界預留標籤寬度。
      svg.append("g").attr("class", "values")
        .selectAll("text").data(data, d => d.district).join("text")
        .attr("x", d => x(d.density) + 8)
        .attr("y", d => y(d.district) + y.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("font-size", narrow ? 13 : 14)
        .attr("font-weight", d => d.density === highest.density ? 700 : 400)
        .attr("fill", colors.ink)
        .style("font-variant-numeric", "tabular-nums")
        .text(d => number(d.density));

      svg.append("text").attr("class", "axis-title").attr("data-axis", "y")
        .attr("x", margin.left - 12).attr("y", 17).attr("text-anchor", "end")
        .attr("font-size", 12).attr("fill", colors.secondary).text("行政區");
      svg.append("text").attr("class", "axis-title").attr("data-axis", "x")
        .attr("x", margin.left + (width - margin.right - margin.left) / 2)
        .attr("y", height - 10).attr("text-anchor", "middle")
        .attr("font-size", 12).attr("fill", colors.secondary).text("人口密度（人／平方公里）");
      container.dataset.ready = "true";
    }

    render();
    if (window.ResizeObserver) new ResizeObserver(render).observe(container);
    else window.addEventListener("resize", render);
    window.addEventListener("beforeprint", render);
    window.addEventListener("afterprint", render);
    if (document.fonts) document.fonts.ready.then(render);
  } catch (error) {
    errorElement.textContent = `圖表無法顯示：${error.message}`;
    errorElement.hidden = false;
    console.error(error);
  }
})();
