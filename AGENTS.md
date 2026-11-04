<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Stock quantities change only through DB functions (set_stock, transfer_stock, receive_reorder) so every change is role-checked and logged in stock_movements.
- Login uses username mapped to a synthetic email (src/lib/arabic.ts usernameToEmail); roles live in user_roles and the first account becomes admin.
- Search normalizes Arabic letter forms client-side via normalizeArabic; inventory screens stay live through the realtime subscription in useInventory.
