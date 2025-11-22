def generate_recommendations(statistics, revenue_by_region, top_products, revenue_by_month, product_metrics):
    """
    Generate a multi-tier structured set of recommendations.

    Returns a dict with keys:
      - product_suggestions
      - region_suggestions
      - customer_suggestions
      - marketing_suggestions
      - overall_strategy

    This function uses simple rule-based heuristics on the provided metrics
    to produce 5-10 suggestions across different categories.
    """
    # Helper builders
    product_suggestions = []
    region_suggestions = []
    customer_suggestions = []
    marketing_suggestions = []
    overall_strategy = []

    # --- Trend / Time-based insights ---
    if revenue_by_month and len(revenue_by_month) >= 2:
        months = list(revenue_by_month.keys())
        last_m = months[-1]
        prev_m = months[-2]
        last = revenue_by_month[last_m]
        prev = revenue_by_month[prev_m] if revenue_by_month.get(prev_m) is not None else 0
        if prev > 0:
            change = (last - prev) / prev * 100
            if change > 15:
                marketing_suggestions.append(f"Doanh thu tháng {last_m} tăng {change:.0f}% so với {prev_m} — tiếp tục tăng ngân sách quảng cáo cho kênh đang vận hành tốt.")
            elif change < -10:
                overall_strategy.append(f"Doanh thu giảm {abs(change):.0f}% so với {prev_m}. Kiểm tra chiến dịch marketing, giá, tồn kho và phản hồi khách hàng cho kỳ này.")
            else:
                overall_strategy.append(f"Doanh thu ổn định (thay đổi {change:.0f}% so với {prev_m}). Theo dõi để phát hiện sớm biến động.")

    # Seasonality cue: simple heuristic using month names
    try:
        # If there are >=6 months, look for repeating highs/lows roughly every 12 months (lightweight)
        if len(revenue_by_month) >= 6:
            months = list(revenue_by_month.keys())
            vals = list(revenue_by_month.values())
            avg = sum(vals) / len(vals)
            highs = [m for m,v in revenue_by_month.items() if v > 1.2 * avg]
            lows = [m for m,v in revenue_by_month.items() if v < 0.8 * avg]
            if highs:
                overall_strategy.append(f"Phát hiện chu kỳ: các tháng {', '.join(highs[-3:])} có doanh thu cao hơn trung bình — cân nhắc tăng tồn kho trước chu kỳ này.")
            if lows:
                overall_strategy.append(f"Phát hiện chu kỳ thấp điểm: {', '.join(lows[-3:])} — cân nhắc khuyến mại hoặc bundle trong những tháng này.")
    except Exception:
        pass

    # --- Product analysis ---
    if top_products:
        # Top performers
        for p in top_products[:5]:
            product_suggestions.append(f"Tăng quảng cáo cho '{p.get('name')}' — doanh thu {p.get('revenue',0):,.0f}, lợi nhuận {p.get('profit',0):,.0f}.")

    # Low performers / low margin
    low_perf = []
    for name, m in product_metrics.items():
        qty = m.get('quantity', 0) or 0
        rev = m.get('revenue', 0) or 0
        margin = m.get('margin', None)
        if rev < 200000 and qty < 10:
            low_perf.append(name)
        elif margin is not None and margin < 0.05 and rev > 0:
            low_perf.append(name)
    if low_perf:
        product_suggestions.append(f"Các sản phẩm cần xem xét ngừng/khuyến mại: {', '.join(low_perf[:8])}.")
        overall_strategy.append("Xem xét tối ưu danh mục: loại bỏ SKUs không hiệu quả hoặc chuyển sang chiến lược clearance.")

    # Price suggestions (simplified)
    high_margin = [n for n,m in product_metrics.items() if (m.get('margin') or 0) > 0.25]
    if high_margin:
        overall_strategy.append(f"Sản phẩm biên lợi nhuận cao: {', '.join(high_margin[:5])}. Có thể tăng nhẹ giá bán hoặc đầu tư quảng cáo để mở rộng lợi nhuận.")

    # --- Region analysis ---
    if revenue_by_region:
        regions_sorted = sorted(revenue_by_region.items(), key=lambda x: x[1], reverse=True)
        best_region, best_rev = regions_sorted[0]
        region_suggestions.append(f"Tập trung marketing tại {best_region} (doanh thu cao: {best_rev:,.0f}).")
        if len(regions_sorted) > 1:
            worst_region, worst_rev = regions_sorted[-1]
            if best_rev > 0 and worst_rev / max(best_rev, 1) < 0.6:
                region_suggestions.append(f"Khu vực {worst_region} giảm mạnh so với {best_region}. Kiểm tra kênh phân phối, giá và chương trình khuyến mãi tại đây.")

    # --- Customer insights (simplified) ---
    # We don't always have detailed segments; attempt to build suggestions from provided statistics
    cust_seg = statistics.get('top_customer_segments') if isinstance(statistics, dict) else None
    if cust_seg:
        for seg in cust_seg[:3]:
            customer_suggestions.append(f"Nhóm khách '{seg.get('segment')}' mua nhiều nhất — đề xuất bundle sản phẩm phù hợp.")

    # Cross-sell / upsell simple heuristics
    if top_products and len(top_products) >= 2:
        a = top_products[0]['name']
        b = top_products[1]['name']
        marketing_suggestions.append(f"Xây dựng chiến dịch cross-sell: gợi ý '{b}' khi khách xem '{a}'.")

    # Marketing suggestions
    marketing_suggestions.append("Test A/B landing pages hoặc creatives cho 2 sản phẩm bán chạy nhất để tăng conversion.")
    marketing_suggestions.append("Đo lường ROAS theo chiến dịch trong 30 ngày gần nhất và rút ngân sách cho chiến dịch hiệu suất thấp.")

    # Supply chain / cost
    overall_strategy.append("Rà soát chi phí nhập hàng và tồn kho cho top SKUs để tối ưu chuỗi cung ứng.")

    # Consolidate and trim to reasonable counts
    def take_unique(lst, limit=6):
        out = []
        for x in lst:
            if x not in out:
                out.append(x)
            if len(out) >= limit:
                break
        return out

    result = {
        'product_suggestions': take_unique(product_suggestions, 8),
        'region_suggestions': take_unique(region_suggestions, 5),
        'customer_suggestions': take_unique(customer_suggestions, 5),
        'marketing_suggestions': take_unique(marketing_suggestions, 6),
        'overall_strategy': take_unique(overall_strategy, 6)
    }

    # Fallback if everything empty
    if not any(len(v) for v in result.values()):
        result['overall_strategy'] = ["Dữ liệu không đủ để đưa ra gợi ý chi tiết. Vui lòng đảm bảo file có các cột: Date, Product, Quantity, Revenue."]

    return result
