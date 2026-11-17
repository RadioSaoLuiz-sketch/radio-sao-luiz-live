# 📻 Rádio São Luiz — Câmera do Celular → OBS (Ao Vivo, baixa latência)

Sistema de transmissão em **WebRTC** (mesma tecnologia de videochamadas):

| Requisito | Como foi resolvido |
|---|---|
| **Sem atraso entre voz e imagem** | Áudio e vídeo vão no mesmo fluxo WebRTC, que sincroniza os dois automaticamente (lip-sync). Buffer de recepção no mínimo (5–40 ms medidos em teste). |
| **Câmera do celular** | Página `camera.html` abre direto no navegador do celular (Android/Chrome ou iPhone/Safari). Sem instalar app. |
| **Link para o OBS** | Página `obs.html` usada como **Fonte de Navegador** no OBS. |
| **Pouca internet, alta qualidade** | Codec VP9/AV1 (até ~40% menos dados que H.264), escolha automática pelo que o celular codifica em hardware, Opus 96 kbps com correção de perdas (FEC), controle adaptativo de banda que prioriza fluidez. |

Atraso total típico: **0,2 a 0,5 s** (contra 5–30 s de RTMP/HLS/YouTube).

---

## 1. Servidor (HTTPS é obrigatório para a câmera)

O servidor só faz a "apresentação" entre celular e OBS — **o vídeo não passa por ele**, vai direto do celular para o computador. Por isso um servidor gratuito/pequeno basta.

### Render.com
- Build: `npm install` · Start: `npm start`
- Variável de ambiente `STREAM_KEY` = chave da transmissão

> No plano grátis o Render "dorme" após 15 min sem uso — abra o link uns 30 s antes do programa.

### No próprio computador do OBS
```bash
npm install
STREAM_KEY=suasenha npm start           # Windows (PowerShell): $env:STREAM_KEY="suasenha"; npm start
cloudflared tunnel --url http://localhost:8080
```

### Docker
```bash
docker build -t rsl-live . && docker run -d -p 8080:8080 -e STREAM_KEY=suasenha rsl-live
```

---

## 2. No celular

Abra: `https://SEU-SERVIDOR/camera.html?key=SUA_CHAVE`

1. Escolha **Qualidade**, **Codec** e **Câmera** → toque **● INICIAR** → permita câmera e microfone.
2. O selo muda para **AGUARDANDO OBS** e depois **● AO VIVO**.
3. As estatísticas no canto mostram resolução, fps, consumo, ping e perda.

Durante o ar dá para trocar câmera (🔄), mudar a qualidade e silenciar o microfone — **sem derrubar a transmissão**.

⚠️ Mantenha a página aberta e a tela ligada. Se for para segundo plano, o celular corta a câmera.

## 3. No OBS

1. **Fontes → + → Navegador**
2. URL: `https://SEU-SERVIDOR/obs.html?key=SUA_CHAVE`
3. Largura **1920**, Altura **1080**
4. Marque **Controlar áudio pelo OBS**
5. Deixe **desmarcados**: "Desligar a fonte quando não estiver visível" e "Atualizar navegador quando a cena se tornar ativa"

### Opções da URL do OBS
| Parâmetro | Efeito |
|---|---|
| `room=estudio2` | Várias câmeras: uma sala por celular (`camera.html?room=estudio2` + `obs.html?room=estudio2`) |
| `buffer=200` | Em 4G fraco: troca ~0,2 s de atraso por imagem mais estável. Padrão `0` (mínimo). |
| `debug=1` | Mostra estatísticas na tela |
| `fill=1` | Preenche a tela cortando bordas |
| `bg=black` | Fundo preto em vez de transparente |
| `idle=0` | Esconde o letreiro "Aguardando câmera" |

> **Sincronia com a voz do estúdio:** se a voz vem do microfone da mesa e a imagem do celular, aplique no OBS um *Deslocamento de sincronia* de ~**+250 ms** no microfone da mesa (ajuste fino batendo palma na frente da câmera).

---

## 4. Consumo de dados

| Qualidade | Resolução | Consumo | Por hora |
|---|---|---|---|
| Econômico | 480p 30fps | ~0,8 Mbps | ~360 MB |
| Equilibrado | 720p 30fps | ~1,6 Mbps | ~720 MB |
| Full HD | 1080p 30fps | ~3,1 Mbps | ~1,4 GB |

## 5. Redes difíceis (TURN)

Se o celular ficar em "AGUARDANDO OBS" e nunca entrar AO VIVO no 4G, configure um TURN:
```
TURN_URL=turn:turn.exemplo.com:3478?transport=udp,turns:turn.exemplo.com:443?transport=tcp
TURN_USER=usuario
TURN_PASS=senha
```
