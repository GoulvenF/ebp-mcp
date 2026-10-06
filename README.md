# ebp-mcp

Projet de serveur MCP communautaire pour consulter les données EBP Cloud/SaaS via des outils métier. Non affilié à EBP Informatique.

**État : préparation de l'implémentation. Aucun serveur exécutable ni paquet npm publié dans ce travail.** L'analyse, les contrats et le plan ont été validés le 2026-10-06. Le corpus est publié sur GitHub ; les tâches de développement sont préparées dans Paperclip, sans lancement automatique.

- [Corpus documentaire et ordre de lecture](docs/README.md)
- [Audit : risques et décisions proposées](docs/06-audit.md)
- [Cahier des charges précis](docs/07-contrats-v01.md)
- [24 tâches de développement ordonnées](docs/08-backlog.md)
- [Preuves fournisseur et recette](docs/09-preuves-et-recette.md)
- [Instructions aux agents](AGENTS.md)
- [Projet et tâches Paperclip](docs/paperclip-index.md)

Dépôt : [`GoulvenF/ebp-mcp`](https://github.com/GoulvenF/ebp-mcp), licence MIT, paquet `@goulvenf/ebp-mcp`. La publication GitHub du corpus précède le développement ; la publication npm fait l'objet du jalon T24.

Périmètre cible : Hubbix Comptabilité, Hubbix Gestion Commerciale, SaaS Gestion Commerciale et SaaS Bâtiment. Première livraison prévue : socle TypeScript/Node 24, transport stdio, 17 outils Hubbix testés sur mocks. Identifiants EBP fournis par l'utilisateur ; lecture seule. Les données exposées au client MCP peuvent être transmises au fournisseur de modèle qu'il utilise.
