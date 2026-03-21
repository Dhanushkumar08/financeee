import re

html = open("d:\\Fin-claud\\templates\\index.html", "r", encoding="utf-8").read()

def extract_and_remove(page_id):
    global html
    # Find the div using regex. Assumes the div closes correctly.
    # To properly extract a tag, we'll find the start and then match its closing tag.
    start_str = f'<div class="page" id="{page_id}">'
    if start_str not in html: return ""
    start_idx = html.find(start_str)
    
    div_level = 0
    end_idx = start_idx
    i = start_idx
    while i < len(html):
        if html[i:i+4] == "<div":
            div_level += 1
        elif html[i:i+6] == "</div>":
            div_level -= 1
            if div_level == 0:
                end_idx = i + 6
                break
        i += 1
    
    content = html[start_idx:end_idx]
    # Remove it from the original HTML
    html = html[:start_idx] + "<!-- moved " + page_id + " -->" + html[end_idx:]
    
    # Strip the wrapper
    content = content.replace(start_str, "", 1)
    if content.endswith("</div>"):
        content = content[:-6]
    return content.strip()

# Cash Flow
income_html = extract_and_remove("page-income")
expenses_html = extract_and_remove("page-expenses")
insights_html = extract_and_remove("page-insights") # was at 379

cf_wrapper = f"""      <!-- CASH FLOW -->
      <div class="page" id="page-cashflow">
        <div class="wealth-header mb16">
          <div class="wealth-title" id="cf-title-text">Income</div>
        </div>
        <div class="wealth-tabs mb16" id="cf-tabs">
          <div class="wealth-tab active" onclick="cfTab('income',this)">Income</div>
          <div class="wealth-tab" onclick="cfTab('expenses',this)">Expenses</div>
          <div class="wealth-tab" onclick="cfTab('insights',this)">Insights</div>
        </div>
        <div id="cfp-income">{income_html}</div>
        <div id="cfp-expenses" style="display:none">{expenses_html}</div>
        <div id="cfp-insights" style="display:none">{insights_html}</div>
      </div>
"""

# Plan
essentials_html = extract_and_remove("page-essentials")
goals_html = extract_and_remove("page-goals")

plan_wrapper = f"""      <!-- PLAN -->
      <div class="page" id="page-plan">
        <div class="wealth-header mb16">
          <div class="wealth-title" id="plan-title-text">Goals</div>
        </div>
        <div class="wealth-tabs mb16" id="plan-tabs">
          <div class="wealth-tab active" onclick="planTab('goals',this)">Goals</div>
        </div>
        <div id="planp-goals">{goals_html}</div>
      </div>
"""

# More
budget_html = extract_and_remove("page-budget")
tax_html = extract_and_remove("page-tax")
bills_html = extract_and_remove("page-bills")
snapshots_html = extract_and_remove("page-snapshots")

more_wrapper = f"""      <!-- MORE -->
      <div class="page" id="page-more">
        <div class="wealth-header mb16">
          <div class="wealth-title" id="more-title-text">Budget</div>
        </div>
        <div class="wealth-tabs mb16" id="more-tabs">
          <div class="wealth-tab active" onclick="moreTab('budget',this)">Budget Planner</div>
          <div class="wealth-tab" onclick="moreTab('tax',this)">Tax Planning</div>
          <div class="wealth-tab" onclick="moreTab('bills',this)">Bills & Subscriptions</div>
          <div class="wealth-tab" onclick="moreTab('snapshots',this)">Snapshots</div>
        </div>
        <div id="morep-budget">{budget_html}</div>
        <div id="morep-tax" style="display:none">{tax_html}</div>
        <div id="morep-bills" style="display:none">{bills_html}</div>
        <div id="morep-snapshots" style="display:none">{snapshots_html}</div>
      </div>
"""

# Now inject the wrappers before "<!-- SETTINGS -->" which is usually at the bottom.
if "<!-- SETTINGS -->" in html:
    html = html.replace("<!-- SETTINGS -->", cf_wrapper + "\n" + plan_wrapper + "\n" + more_wrapper + "\n<!-- SETTINGS -->")
else:
    # Just put it before the closing '</div> <!-- /main content area -->'
    html = html.replace('<div class="page" id="page-settings">', cf_wrapper + "\n" + plan_wrapper + "\n" + more_wrapper + "\n<div class=\"page\" id=\"page-settings\">")

with open("d:\\Fin-claud\\templates\\index.html", "w", encoding="utf-8") as f:
    f.write(html)

print("Done")
