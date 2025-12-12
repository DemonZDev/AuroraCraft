
async function testDeletion() {
    try {
        const baseURL = 'http://127.0.0.1:4000/api';

        // 1. Login
        console.log('Logging in...');
        const loginRes = await fetch(`${baseURL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'admin@auroracraft.local',
                password: 'Admin123!'
            })
        });

        if (!loginRes.ok) throw new Error(`Login failed: ${loginRes.status}`);
        const cookie = loginRes.headers.get('set-cookie');
        console.log('Login successful');

        // 2. Get OpenRouter Provider ID
        const providersRes = await fetch(`${baseURL}/admin/providers`, {
            headers: { Cookie: cookie }
        });
        const providersData = await providersRes.json();
        const provider = providersData.providers.find(p => p.name === 'OpenRouter');
        if (!provider) throw new Error('OpenRouter provider not found');

        // 3. Create Dummy Model
        console.log('Creating dummy model...');
        const modelRes = await fetch(`${baseURL}/admin/models`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Cookie: cookie
            },
            body: JSON.stringify({
                name: 'Delete Me Test',
                modelId: 'test/delete-me',
                providerId: provider.id,
                inputTokenCost: 0,
                outputTokenCost: 0
            })
        });

        const modelData = await modelRes.json();
        if (!modelRes.ok) throw new Error(`Create failed: ${JSON.stringify(modelData)}`);
        const modelId = modelData.model.id;
        console.log('Model created:', modelId);

        // 4. Delete Model
        console.log('Deleting model...');
        const deleteRes = await fetch(`${baseURL}/admin/models/${modelId}`, {
            method: 'DELETE',
            headers: { Cookie: cookie }
        });

        if (!deleteRes.ok) {
            const err = await deleteRes.text();
            throw new Error(`Delete failed: ${err}`);
        }

        console.log('✅ Model deleted successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

testDeletion();
