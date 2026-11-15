# Fix ordine sidebar RispostaFlirt

La lista delle ragazze ora segue l'ordine di utilizzo recente.

- Quando apri una ragazza, quella ragazza passa in cima.
- Le altre restano nello stesso ordine relativo.
- Esempio: Benedetta, Luana, Franci, Puffetta, Maria Giulia -> aprendo Maria Giulia diventa Maria Giulia, Benedetta, Luana, Franci, Puffetta.
- Aprendo poi Benedetta diventa Benedetta, Maria Giulia, Luana, Franci, Puffetta.
- Aprendo Puffetta diventa Puffetta, Benedetta, Maria Giulia, Luana, Franci.

La modifica usa il campo `updatedAt` già presente, quindi non crea una nuova struttura dati.
