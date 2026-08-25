routerAdd("POST", "/api/extract-card", (c) => {
    const data = $apis.requestInfo(c).data || {};
    let rawImages = [];

    // Tenta pegar de JSON (images ou image) ou via FormData (c.formValue)
    if (Array.isArray(data.images) && data.images.length > 0) {
        rawImages = data.images;
    } else if (data.image) {
        rawImages = [data.image];
    } else if (c.formValue("image")) {
        rawImages = [c.formValue("image")];
    } else {
        // Imprime no log do servidor o que chegou de fato para debugar
        console.log("Recebido na rota extract-card:", JSON.stringify(data));
        return c.json(400, { error: "Nenhuma imagem foi fornecida. Verifique o formato de envio do Frontend." });
    }

    const cleanedImages = rawImages.map(img => img.replace(/^data:image\/\w+;base64,/, ""));

    try {
        const res = $http.send({
            url: "http://172.17.0.1:11434/api/generate",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "hf.co/LiquidAI/LFM2.5-VL-450M-GGUF:Q8_0",
                prompt: "Examine todas as imagens (frente/verso do cartão de visita) e retorne os dados num JSON estrito. Chaves: \"nome_empresa\", \"nome_contato\", \"telefone\", \"whatsapp\", \"email\", \"site\", \"endereco\", \"cidade\", \"ramo_atividade\", \"redes_sociais\".",
                images: cleanedImages,
                stream: false
            }),
            timeout: 60
        });

        if (res.statusCode !== 200) {
            return c.json(500, { error: "Erro no serviço Ollama", status: res.statusCode });
        }

        const ollamaResponse = JSON.parse(res.raw);
        let extractedData = {};

        try {
            extractedData = JSON.parse(ollamaResponse.response);
        } catch (parseErr) {
            const match = ollamaResponse.response.match(/\{[\s\S]*\}/);
            if (match) {
                extractedData = JSON.parse(match[0]);
            } else {
                return c.json(422, { error: "Falha na estrutura da IA", raw: ollamaResponse.response });
            }
        }
        return c.json(200, { success: true, data: extractedData });
    } catch (err) {
        return c.json(500, { error: err.message });
    }
});
